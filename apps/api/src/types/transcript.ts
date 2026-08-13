export type TranscriptSegment = {
  id: string;
  type: "final" | "partial";
  start: number | null;
  end: number | null;
  speaker: string | null;
  text: string;
};
