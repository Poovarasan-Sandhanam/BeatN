import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { modelRuntime, type ModelRef } from '../core/ai/ModelRuntime';
import { getOrCreateDeviceId, openDatabase } from '../core/db/connection';
import { JournalEntryRepository } from '../core/db/repositories/JournalEntryRepository';
import { ProcessingJobRepository } from '../core/db/repositories/ProcessingJobRepository';
import { ProcessingQueue } from '../core/jobs/ProcessingQueue';
import { createAnalyseHandler } from '../core/jobs/handlers/analyseHandler';
import { createTranscribeHandler } from '../core/jobs/handlers/transcribeHandler';
import { modelManager } from '../core/models/ModelManager';
import { DEFAULT_BUNDLE_ID, getBundle } from '../core/models/bundles';
import { uuidv7 } from '../domain/ids';
import { cryptoRandomSource } from '../core/platform';
import { JournalService } from './JournalService';

export interface Services {
  journal: JournalService;
  queue: ProcessingQueue;
  /** Bumped whenever a job settles or the user changes an entry, so lists can refetch without polling. */
  revision: number;
}

const ServiceContext = createContext<Services | null>(null);

type Built = Omit<Services, 'revision'>;

/** Resolves the active model for a pipeline step from the installed bundle. */
function resolveModel(kind: 'stt' | 'llm'): ModelRef | null {
  const bundle = getBundle(DEFAULT_BUNDLE_ID);
  const modelId = kind === 'stt' ? bundle.sttModelId : bundle.llmModelId;
  const installed = modelManager.installed(modelId);
  if (!installed) return null;
  return { modelId, path: installed.path, approxBytes: installed.spec.approxBytes };
}

/**
 * Builds the app's long-lived services once and starts the processing queue.
 *
 * Mounted above every screen. The queue starts here rather than in a screen so
 * that processing continues while the user navigates, and resumes on launch
 * for anything a previous run left unfinished.
 */
export function ServiceProvider({ children }: { children: ReactNode }) {
  // State, not a ref: the provider must re-render when the services exist,
  // and reading `ref.current` during render is both unreliable and a lint
  // error for exactly that reason.
  const [built, setBuilt] = useState<Built | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let queue: ProcessingQueue | null = null;

    (async () => {
      try {
        const db = await openDatabase();
        const deviceId = await getOrCreateDeviceId(db, cryptoRandomSource);

        const entries = new JournalEntryRepository(db);
        const jobs = new ProcessingJobRepository(db, () => uuidv7(cryptoRandomSource));

        const bumpRevision = () => setRevision((value) => value + 1);

        queue = new ProcessingQueue(jobs, {
          // Any settled job may have changed what a list should show.
          onJobSettled: bumpRevision,
        });

        const handlerDeps = { entries, jobs, runtime: modelRuntime, resolveModel };
        queue.register('transcribe', createTranscribeHandler(handlerDeps));
        queue.register('analyse', createAnalyseHandler(handlerDeps));

        const journal = new JournalService({
          entries,
          jobs,
          queue,
          deviceId,
          random: cryptoRandomSource,
          onChange: bumpRevision,
        });

        await queue.start();

        if (cancelled) {
          await queue.stop();
          return;
        }

        setBuilt({ journal, queue });
      } catch {
        // Screens render a "not ready" state; the failure surfaces there
        // rather than being logged, per the privacy rule.
        if (!cancelled) setBuilt(null);
      }
    })();

    return () => {
      cancelled = true;
      void queue?.stop();
    };
  }, []);

  if (!built) {
    return <ServiceContext.Provider value={null}>{children}</ServiceContext.Provider>;
  }

  return (
    <ServiceContext.Provider value={{ ...built, revision }}>{children}</ServiceContext.Provider>
  );
}

/** Null until the database is open and the queue has started. */
export function useServices(): Services | null {
  return useContext(ServiceContext);
}

/** Throws if used above the provider's ready state — for screens that require it. */
export function useRequiredServices(): Services {
  const services = useContext(ServiceContext);
  if (!services) throw new Error('SERVICES_NOT_READY');
  return services;
}
