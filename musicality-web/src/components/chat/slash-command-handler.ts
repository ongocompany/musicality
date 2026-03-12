/**
 * Slash command parser for group chat.
 * Supported: /invite, /kick @name, /close
 */

export type SlashCommand =
  | { type: 'invite' }
  | { type: 'kick'; targetName: string }
  | { type: 'close' }
  | null;

export function parseSlashCommand(input: string): SlashCommand {
  const trimmed = input.trim();

  if (trimmed === '/invite') {
    return { type: 'invite' };
  }

  if (trimmed === '/close') {
    return { type: 'close' };
  }

  const kickMatch = trimmed.match(/^\/kick\s+@?(.+)$/);
  if (kickMatch) {
    return { type: 'kick', targetName: kickMatch[1].trim() };
  }

  return null;
}

/** Check if input starts with a slash command prefix (for UI hints) */
export function isSlashCommandPrefix(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed === '/' ||
    '/invite'.startsWith(trimmed) ||
    '/kick'.startsWith(trimmed) ||
    '/close'.startsWith(trimmed)
  );
}
