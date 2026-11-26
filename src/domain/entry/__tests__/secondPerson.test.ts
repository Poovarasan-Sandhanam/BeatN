import { toSecondPerson } from '../secondPerson';

describe('toSecondPerson', () => {
  // The three summaries the iPhone 14 showed on Home, verbatim in shape.
  it.each([
    [
      'The person is looking for a new room to rebuild themselves and get more energy after a new job in London.',
      "You're looking for a new room to rebuild yourself and get more energy after a new job in London.",
    ],
    [
      'The person is planning a trip to Europe and is very happy about their new job and the sponsorship.',
      "You're planning a trip to Europe and are very happy about your new job and the sponsorship.",
    ],
    [
      'The person was feeling sleepy but still doing their job.',
      'You were feeling sleepy but still doing your job.',
    ],
  ])('rewrites %p', (input, expected) => {
    expect(toSecondPerson(input)).toBe(expected);
  });

  it.each([
    ['The user feels tired after work.', 'You feel tired after work.'],
    ['The speaker worries about money.', 'You worry about money.'],
    ['The person has been busy and they want a break.', 'You have been busy and you want a break.'],
    ['This person wishes things were calmer.', 'You wish things were calmer.'],
    ['The person reflects on what matters to them.', 'You reflect on what matters to you.'],
  ])('handles %p', (input, expected) => {
    expect(toSecondPerson(input)).toBe(expected);
  });

  it.each([
    [
      'Today was a good day. The person finished a presentation and felt proud and calm.',
      'Today was a good day. You finished a presentation and felt proud and calm.',
    ],
    [
      'A heavy week. The user is tired and they want a quiet weekend.',
      "A heavy week. You're tired and you want a quiet weekend.",
    ],
    ['Work ran late! This person needs rest.', 'Work ran late! You need rest.'],
  ])('rewrites narration that starts mid-text: %p', (input, expected) => {
    expect(toSecondPerson(input)).toBe(expected);
  });

  it.each([
    [
      'The person is not a singer and feels uncertain about their abilities.',
      "You're not a singer and feel uncertain about your abilities.",
    ],
    ['The user is tired but still wants to finish the project.', "You're tired but still want to finish the project."],
    ['The person had a long day and worries about tomorrow.', 'You had a long day and worry about tomorrow.'],
    ['The speaker feels calm and seems ready for the week.', 'You feel calm and seem ready for the week.'],
  ])('keeps a carried-over verb in agreement: %p', (input, expected) => {
    expect(toSecondPerson(input)).toBe(expected);
  });

  it.each([
    ['The person thinks about needs and wants.', 'You think about needs and wants.'],
    ['The user wrote about hopes and fears.', 'You wrote about hopes and fears.'],
    ['The person talked about work and plans.', 'You talked about work and plans.'],
  ])('leaves a noun after "and" alone: %p', (input, expected) => {
    expect(toSecondPerson(input)).toBe(expected);
  });

  it.each([
    'Your manager said the person who led it did well.', // not at a sentence start
    'Today was calm. They said the project is late.',
  ])('leaves %p alone — no sentence narrates the user', (text) => {
    expect(toSecondPerson(text)).toBe(text);
  });

  it.each([
    "You're planning a trip to Europe.",
    'A long day, but a good one.',
    'They said the project is late.', // reported speech, not narration of the user
    'Sleep earlier tonight.',
    '',
  ])('leaves %p alone — it is not narrating the user', (text) => {
    expect(toSecondPerson(text)).toBe(text);
  });
});
