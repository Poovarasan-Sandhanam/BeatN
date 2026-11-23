/**
 * Rewrites "The person is planning a trip…" as "You're planning a trip…".
 *
 * A journal should speak to you, not about you. The analysis prompt asks for
 * the second person, but small on-device models often slip into narrating
 * "the person" or "the user". This catches the common shapes of that slip.
 * It is deliberately narrow: text that does not open by narrating someone
 * in the third person is returned untouched.
 */

const NARRATOR = /^\s*(?:the|this)\s+(?:person|user|speaker|author|individual|narrator|journaler|writer)\b/i;
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

/** A verb carried over from the subject: "…and is very happy" → "…and are very happy". */
const CONTINUED_VERB = /\b(and|but|yet|or)\s+(is|was|has|isn't|wasn't|hasn't)\b/gi;

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toSecondPerson(text: string): string {
  if (!NARRATOR.test(text)) return text;

  // Subject + first verb: "The person is" → "You are", "The user feels" → "You feel".
  let result = text.replace(
    /(\b(?:the|this)\s+(?:person|user|speaker|author|individual|narrator|journaler|writer))\s+([A-Za-z']+)/gi,
    (_match, _subject: string, verb: string) => `you ${toPlural(verb)}`,
  );
  result = result.replace(NARRATOR_ANYWHERE, 'you');
  result = result.replace(CONTINUED_VERB, (_m, conjunction: string, verb: string) => `${conjunction} ${toPlural(verb)}`);
  for (const [pattern, replacement] of PRONOUNS) result = result.replace(pattern, replacement);

  // Contract the common opener, as a person would say it.
  result = result.replace(/^(\s*)you are\b/i, "$1you're");
  return capitalise(result.trimStart());
}
