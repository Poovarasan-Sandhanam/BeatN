import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { modelRuntime, type ModelRef } from '../core/ai/ModelRuntime';
import { getOrCreateDeviceId, openDatabase } from '../core/db/connection';
import { JournalEntryRepository } from '../core/db/repositories/JournalEntryRepository';
import { ProcessingJobRepository } from '../core/db/repositories/ProcessingJobRepository';
import { ProcessingQueue } from '../core/jobs/ProcessingQueue';
import { createAnalyseHandler } from '../core/jobs/handlers/analyseHandler';
import { createTranscribeHandler } from '../core/jobs/handlers/transcribeHandler';
import { modelManager } from '../core/models/ModelManager';
import { DEFAULT_BUNDLE_ID, getBundle } from '../core/models/bundles';
import { uuidv7 } from '../domain/shared/ids';
import { cryptoRandomSource } from '../core/platform/randomSource';
import { JournalService } from './JournalService';

export interface Services {
  journal: JournalService;
  queue: ProcessingQueue;
  /** Bumped whenever a job settles, so lists can refetch without polling. */
  revision: number;
}

const ServiceContext = createContext<Services | null>(null);

type Status = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

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
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  const servicesRef = useRef<Omit<Services, 'revision'> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let queue: ProcessingQueue | null = null;

    (async () => {
      try {
        const db = await openDatabase();
        const deviceId = await getOrCreateDeviceId(db, cryptoRandomSource);

        const entries = new JournalEntryRepository(db);
        const jobs = new ProcessingJobRepository(db, () => uuidv7(cryptoRandomSource));

        queue = new ProcessingQueue(jobs, {
          // Any settled job may have changed what a list should show.
          onJobSettled: () => setRevision((value) => value + 1),
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
        });

        await queue.start();

        if (cancelled) {
          await queue.stop();
          return;
        }

        servicesRef.current = { journal, queue };
        setStatus({ kind: 'ready' });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setStatus({ kind: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
      void queue?.stop();
    };
  }, []);

  if (status.kind !== 'ready' || !servicesRef.current) {
    return <ServiceContext.Provider value={null}>{children}</ServiceContext.Provider>;
  }

  return (
    <ServiceContext.Provider value={{ ...servicesRef.current, revision }}>
      {children}
    </ServiceContext.Provider>
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
