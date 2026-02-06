import type { PipelineStage } from './types';

type FormattingStyle = 'plain' | 'markdown' | 'slack';

type OutputToken = { type: 'word' | 'punct' | 'newline'; text: string };

const formatWord = (word: string, style: FormattingStyle, kind: 'bold' | 'italic') => {
  if (style === 'plain') return word;
  if (style === 'markdown') {
    return kind === 'bold' ? `**${word}**` : `*${word}*`;
  }
  return kind === 'bold' ? `*${word}*` : `_${word}_`;
};

const applyFormattingCommands = (
  input: string,
  style: FormattingStyle,
  level: 'punctuation' | 'full'
) => {
  const rawTokens = input.trim().split(/\s+/).filter(Boolean);
  if (!rawTokens.length) return input.trim();
  const allowFormatting = level === 'full';
  const allowDeletes = level === 'full';
  const tokens = rawTokens.map((raw) => {
    const match = raw.match(/^(.+?)([.,!?;:]+)?$/);
    const word = match?.[1] ?? raw;
    const trailing = match?.[2] ?? '';
    return {
      raw,
      word,
      trailing,
      lower: word.toLowerCase(),
    };
  });
  const lowerTokens = tokens.map((token) => token.lower);
  const output: OutputToken[] = [];
  let pendingSentenceFormat: 'bold' | 'italic' | null = null;

  const pushWord = (text: string) => output.push({ type: 'word', text });
  const pushPunct = (text: string) => output.push({ type: 'punct', text });
  const pushNewline = () => output.push({ type: 'newline', text: '\n' });

  const removeTrailingPunct = () => {
    while (output.length && output[output.length - 1].type === 'punct') {
      output.pop();
    }
  };

  const applyToLastWord = (kind: 'bold' | 'italic') => {
    if (!allowFormatting) return;
    for (let index = output.length - 1; index >= 0; index -= 1) {
      if (output[index].type === 'word') {
        output[index].text = formatWord(output[index].text, style, kind);
        return;
      }
    }
  };

  const deleteLastWord = () => {
    if (!allowDeletes) return;
    removeTrailingPunct();
    for (let index = output.length - 1; index >= 0; index -= 1) {
      if (output[index].type === 'word') {
        output.splice(index, 1);
        removeTrailingPunct();
        return;
      }
    }
  };

  const deleteLastSentence = () => {
    if (!allowDeletes) return;
    removeTrailingPunct();
    for (let index = output.length - 1; index >= 0; index -= 1) {
      const token = output[index];
      if (token.type === 'newline') {
        output.splice(index);
        return;
      }
      if (token.type === 'punct' && /[.!?]/.test(token.text)) {
        output.splice(index);
        return;
      }
    }
    output.length = 0;
  };

  const matchAt = (index: number, ...sequence: string[]) =>
    sequence.every((value, offset) => lowerTokens[index + offset] === value);

  const consumeNextWord = (start: number, kind: 'bold' | 'italic', skip: number) => {
    if (!allowFormatting) return start + skip;
    const targetIndex = start + skip;
    const next = tokens[targetIndex];
    if (next?.word) {
      pushWord(formatWord(next.word, style, kind));
      if (next.trailing) pushPunct(next.trailing);
      return targetIndex + 1;
    }
    return start + skip;
  };

  const startSentenceFormat = (kind: 'bold' | 'italic') => {
    if (!allowFormatting) return;
    pendingSentenceFormat = kind;
  };

  const applySentenceFormat = (word: string) => {
    if (!pendingSentenceFormat) return word;
    return formatWord(word, style, pendingSentenceFormat);
  };

  const clearSentenceFormatOnPunct = (punct: string) => {
    if (!pendingSentenceFormat) return;
    if (/[.!?]/.test(punct)) {
      pendingSentenceFormat = null;
    }
  };

  let i = 0;
  while (i < tokens.length) {
    if (matchAt(i, 'new', 'line')) {
      pushNewline();
      i += 2;
      pendingSentenceFormat = null;
      continue;
    }
    if (matchAt(i, 'full', 'stop')) {
      pushPunct('.');
      clearSentenceFormatOnPunct('.');
      i += 2;
      continue;
    }
    if (matchAt(i, 'question', 'mark')) {
      pushPunct('?');
      clearSentenceFormatOnPunct('?');
      i += 2;
      continue;
    }
    if (matchAt(i, 'exclamation', 'point') || matchAt(i, 'exclamation', 'mark')) {
      pushPunct('!');
      clearSentenceFormatOnPunct('!');
      i += 2;
      continue;
    }
    if (lowerTokens[i] === 'comma') {
      pushPunct(',');
      i += 1;
      continue;
    }
    if (lowerTokens[i] === 'period') {
      pushPunct('.');
      clearSentenceFormatOnPunct('.');
      i += 1;
      continue;
    }
    if (lowerTokens[i] === 'semicolon') {
      pushPunct(';');
      i += 1;
      continue;
    }
    if (lowerTokens[i] === 'colon') {
      pushPunct(':');
      i += 1;
      continue;
    }
    if (lowerTokens[i] === 'dash') {
      pushPunct('—');
      i += 1;
      continue;
    }
    if (lowerTokens[i] === 'ellipsis') {
      pushPunct('...');
      i += 1;
      continue;
    }

    if (matchAt(i, 'delete', 'last', 'word')) {
      deleteLastWord();
      i += 3;
      continue;
    }
    if (matchAt(i, 'delete', 'the', 'last', 'word') || matchAt(i, 'delete', 'that', 'last', 'word')) {
      deleteLastWord();
      i += 4;
      continue;
    }
    if (matchAt(i, 'delete', 'last', 'sentence')) {
      deleteLastSentence();
      i += 3;
      continue;
    }
    if (
      matchAt(i, 'delete', 'the', 'last', 'sentence') ||
      matchAt(i, 'delete', 'that', 'last', 'sentence')
    ) {
      deleteLastSentence();
      i += 4;
      continue;
    }

    if (matchAt(i, 'bold', 'last', 'word') || matchAt(i, 'last', 'word', 'bold')) {
      applyToLastWord('bold');
      i += 3;
      continue;
    }
    if (matchAt(i, 'italic', 'last', 'word') || matchAt(i, 'last', 'word', 'italic')) {
      applyToLastWord('italic');
      i += 3;
      continue;
    }
    if (matchAt(i, 'make', 'last', 'word', 'bold')) {
      applyToLastWord('bold');
      i += 4;
      continue;
    }
    if (matchAt(i, 'make', 'last', 'word', 'italic')) {
      applyToLastWord('italic');
      i += 4;
      continue;
    }
    if (matchAt(i, 'make', 'the', 'last', 'word', 'bold')) {
      applyToLastWord('bold');
      i += 5;
      continue;
    }
    if (matchAt(i, 'make', 'the', 'last', 'word', 'italic')) {
      applyToLastWord('italic');
      i += 5;
      continue;
    }

    if (matchAt(i, 'make', 'next', 'sentence', 'bold')) {
      startSentenceFormat('bold');
      i += 4;
      continue;
    }
    if (matchAt(i, 'make', 'next', 'sentence', 'italic')) {
      startSentenceFormat('italic');
      i += 4;
      continue;
    }
    if (matchAt(i, 'make', 'the', 'next', 'sentence', 'bold')) {
      startSentenceFormat('bold');
      i += 5;
      continue;
    }
    if (matchAt(i, 'make', 'the', 'next', 'sentence', 'italic')) {
      startSentenceFormat('italic');
      i += 5;
      continue;
    }
    if (matchAt(i, 'next', 'sentence', 'bold') || matchAt(i, 'bold', 'next', 'sentence')) {
      startSentenceFormat('bold');
      i += 3;
      continue;
    }
    if (matchAt(i, 'next', 'sentence', 'italic') || matchAt(i, 'italic', 'next', 'sentence')) {
      startSentenceFormat('italic');
      i += 3;
      continue;
    }

    if (matchAt(i, 'make', 'next', 'word', 'bold')) {
      i = consumeNextWord(i, 'bold', 4);
      continue;
    }
    if (matchAt(i, 'make', 'next', 'word', 'italic')) {
      i = consumeNextWord(i, 'italic', 4);
      continue;
    }
    if (matchAt(i, 'make', 'the', 'next', 'word', 'bold')) {
      i = consumeNextWord(i, 'bold', 5);
      continue;
    }
    if (matchAt(i, 'make', 'the', 'next', 'word', 'italic')) {
      i = consumeNextWord(i, 'italic', 5);
      continue;
    }
    if (matchAt(i, 'next', 'word', 'bold')) {
      i = consumeNextWord(i, 'bold', 3);
      continue;
    }
    if (matchAt(i, 'next', 'word', 'italic')) {
      i = consumeNextWord(i, 'italic', 3);
      continue;
    }
    if (matchAt(i, 'bold', 'next', 'word')) {
      i = consumeNextWord(i, 'bold', 3);
      continue;
    }
    if (matchAt(i, 'italic', 'next', 'word')) {
      i = consumeNextWord(i, 'italic', 3);
      continue;
    }

    const token = tokens[i];
    if (token.word) {
      pushWord(applySentenceFormat(token.word));
    }
    if (token.trailing) {
      pushPunct(token.trailing);
      clearSentenceFormatOnPunct(token.trailing);
    }
    i += 1;
  }

  let result = '';
  output.forEach((token) => {
    if (token.type === 'newline') {
      result = result.trimEnd();
      result += '\n';
      return;
    }
    if (token.type === 'punct') {
      result = result.trimEnd();
      result += token.text + ' ';
      return;
    }
    result += token.text + ' ';
  });
  return result.trim();
};

const normalizeShortcutToken = (value: string) =>
  value
    .trim()
    .replace(/^[\s"'“”‘’()[\]{}<>]+|[\s"'“”‘’()[\]{}<>]+$/g, '')
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const applyShortcuts = (input: string, shortcuts: Array<{ keyword: string; snippet: string }>) => {
  if (!input.trim()) return input;
  const normalizedInput = normalizeShortcutToken(input);
  if (!normalizedInput) return input;
  const match = shortcuts.find(
    (entry) => normalizeShortcutToken(entry.keyword) === normalizedInput
  );
  if (!match) return input;
  return match.snippet;
};

export const whitespaceNormalizationStage: PipelineStage = {
  id: 'whitespace-normalization',
  enabled: () => true,
  run: (input) => {
    if (!input.includes('\n') && !input.includes('\r')) {
      return input.replace(/\s+/g, ' ').trim();
    }
    return input
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .join('\n')
      .trim();
  },
};

export const shortcutStage: PipelineStage = {
  id: 'shortcuts',
  enabled: (context) => Boolean(context.mode?.shortcutsEnabled && context.shortcuts.length),
  run: (input, context) => applyShortcuts(input, context.shortcuts),
};

export const formattingCommandStage: PipelineStage = {
  id: 'formatting-commands',
  enabled: (context) =>
    Boolean(context.mode?.formattingEnabled || context.mode?.punctuationCommandsEnabled),
  run: (input, context) => {
    const style = context.mode?.formattingStyle ?? 'plain';
    const level = context.mode?.formattingEnabled ? 'full' : 'punctuation';
    return applyFormattingCommands(input, style, level);
  },
};

export const punctuationNormalizationStage: PipelineStage = {
  id: 'punctuation-normalization',
  enabled: (context) =>
    context.mode?.punctuationNormalization ?? context.settings.punctuationNormalization,
  run: (input) => {
    const normalizeLine = (line: string) =>
      line
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/\.{3,}/g, '...')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    if (!input.includes('\n') && !input.includes('\r')) {
      return normalizeLine(input);
    }
    return input
      .split(/\r?\n/)
      .map((line) => normalizeLine(line))
      .join('\n')
      .trim();
  },
};

export const vocabularyReplacementStage: PipelineStage = {
  id: 'vocabulary-replacements',
  enabled: (context) => context.vocabulary.length > 0,
  run: (input, context) => {
    return context.vocabulary.reduce((acc, entry) => {
      if (!entry.source) return acc;
      const regex = new RegExp(`\\b${escapeRegExp(entry.source)}\\b`, 'gi');
      return acc.replace(regex, entry.replacement);
    }, input);
  },
};

export const keywordCommandStage: PipelineStage = {
  id: 'keyword-commands',
  enabled: () => true,
  run: (input) => input,
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
