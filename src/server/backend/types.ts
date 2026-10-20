import type { Enquiry } from '@/lib/enquiry-schema';
import type { Row } from './tables';

export type BackendMode = 'master' | 'mirror';

/** What public pages need, whichever backend serves them. */
export interface Backend {
  mode: BackendMode;
  /** Published listings, featured first, then oldest first. */
  publishedProperties(): Promise<Row[]>;
  /** Completed tours with a video, newest first. */
  completedTours(): Promise<{ property_id: string; video_path: string; created_at: string }[]>;
  /** Active homepage scenes in display order. */
  activeSlides(): Promise<{ id: string; label: string; video_path: string | null; image_path: string | null }[]>;
  activeTeam(): Promise<Row[]>;
  approvedTestimonials(): Promise<Row[]>;
  setting(key: string): Promise<unknown | null>;
  /** Signed links for private media paths; missing entries could not be signed. */
  signMedia(paths: string[], expiresIn: number): Promise<Record<string, string>>;
  /** Stores a validated enquiry and alerts ENKOP; never fails because of the alert. */
  submitEnquiry(data: Enquiry): Promise<void>;
}
