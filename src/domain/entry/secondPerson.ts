/**
 * Rewrites "The person is planning a trip…" as "You're planning a trip…".
 *
 * A journal should speak to you, not about you. The analysis prompt asks for
 * the second person, but small on-device models often slip into narrating
 * "the person" or "the user". This catches the common shapes of that slip.
 * It is deliberately narrow: only a sentence that opens by narrating someone
 * in the third person — and the sentences after it — are rewritten. A model
 * often starts in the user's own words ("Today was a good day.") and slips
 * into narration in the next sentence; everything before that slip is kept.
 */

/** A sentence that opens by narrating the user: at the start, or after . ! ? */
const NARRATED_SENTENCE = /(^\s*|[.!?]["”’)]?\s+)(?:the|this)\s+(?:person|user|speaker|author|individual|narrator|journaler|writer)\b/i;
const NARRATOR_ANYWHERE = /\b(?:the|this)\s+(?:person|user|speaker|author|individual|narrator|journaler|writer)\b/gi;

/** "is" → "are", "feels" → "feel", "worries" → "worry": the verb after "you". */
function toPlural(verb: string): string {
  const lower = verb.toLowerCase();
  const irregular: Record<string, string> = { is: 'are', was: 'were', has: 'have', does: 'do', "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't", "doesn't": "don't" };
  if (irregular[lower]) return irregular[lower];
  if (/(?:ss|sh|ch|x|zz|o)es$/.test(lower)) return verb.slice(0, -2);
  if (/[^aeiou]ies$/.test(lower)) return `${verb.slice(0, -3)}y`;
  if (/[^s]s$/.test(lower)) return verb.slice(0, -1);
  return verb;
}

/** Possessive and object forms that follow from the subject becoming "you". */
const PRONOUNS: [RegExp, string][] = [
  [/\bthemselves\b|\bthemself\b/gi, 'yourself'],
  [/\btheirs\b/gi, 'yours'],
  [/\btheir\b/gi, 'your'],
  [/\bthey're\b/gi, "you're"],
  [/\bthey've\b/gi, "you've"],
  [/\bthey'll\b/gi, "you'll"],
  [/\bthey'd\b/gi, "you'd"],
  [/\bthey\b/gi, 'you'],
  [/\bthem\b/gi, 'you'],
];

/**
 * A verb carried over from the subject: "…and is very happy" → "…and are very
 * happy", "…and feels unsure" → "…and feel unsure".
 *
 * Only words that are verbs whatever follows them are changed on sight. Words
 * that are just as often nouns ("needs and wants", "hopes and fears") change
 * only when what follows makes them a verb: "…and wants to rest".
 */
const ADVERB = '(?:also|still|really|often|sometimes|now|even|just|clearly|deeply|increasingly)';
const ALWAYS_VERB =
  "is|was|has|does|isn't|wasn't|hasn't|doesn't|feels|seems|appears|enjoys|tries|finds|knows|believes|thinks|wonders|realises|realizes|acknowledges|recognises|recognizes|appreciates|decides|expresses|mentions|describes|says|notes|considers|misses|keeps|continues|remains|gets|becomes|goes|reflects|admits";
const VERB_BEFORE = 'wants|needs|hopes|wishes|worries|plans|fears|doubts|cares|struggles';
const CONTINUED_VERB = new RegExp(
  `\\b(and|but|yet|or)(\\s+${ADVERB})?\\s+(${ALWAYS_VERB}|(?:${VERB_BEFORE})(?=\\s+(?:to|that|about|for|with|more|less)\\b))\\b`,
  'gi',
);

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toSecondPerson(text: string): string {
  const match = NARRATED_SENTENCE.exec(text);
  if (!match) return fixYouSentences(text);
  const cut = match.index + match[1].length;
  return fixYouSentences(text.slice(0, cut)) + rewriteNarration(text.slice(cut));
}

/**
 * A sentence already about "you" can still carry a third-person verb — the
 * model writes it, or it was saved by an older version of this rewrite:
 * "You're not a singer and feels unsure" → "…and feel unsure". Only sentences
 * that open with "you" are touched, so "They said it is late and seems…" stays.
 */
function fixYouSentences(text: string): string {
  return text.replace(/(^|[.!?]["”’)]?\s+)(you\b[^.!?]*)/gi, (_m, lead: string, sentence: string) =>
    lead + agreeCarriedVerbs(sentence),
  );
}

function agreeCarriedVerbs(text: string): string {
  return text.replace(
    CONTINUED_VERB,
    (_m, conjunction: string, adverb: string | undefined, verb: string) =>
      `${conjunction}${adverb ?? ''} ${toPlural(verb)}`,
  );
}

/** Rewrites text that opens with the narrator ("The person …"). */
function rewriteNarration(text: string): string {
  // Subject + first verb: "The person is" → "You are", "The user feels" → "You feel".
  let result = text.replace(
    /(\b(?:the|this)\s+(?:person|user|speaker|author|individual|narrator|journaler|writer))\s+([A-Za-z']+)/gi,
    (_match, _subject: string, verb: string) => `you ${toPlural(verb)}`,
  );
  result = result.replace(NARRATOR_ANYWHERE, 'you');
  result = agreeCarriedVerbs(result);
  for (const [pattern, replacement] of PRONOUNS) result = result.replace(pattern, replacement);

  // Contract the common opener, as a person would say it.
  result = result.replace(/^(\s*)you are\b/i, "$1you're");
  return capitalise(result.trimStart());
}
