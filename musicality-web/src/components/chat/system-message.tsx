'use client';

interface Props {
  content: string;
}

export function SystemMessage({ content }: Props) {
  return (
    <div className="flex items-center justify-center my-3">
      <span className="text-[11px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
        {content}
      </span>
    </div>
  );
}
