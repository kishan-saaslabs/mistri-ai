import { query, queryOne } from "../config/database.js";

export type RepRecord = {
  id: string;
  slug: string;
  name: string;
  initials: string;
  role: string;
  created_at: Date;
};

export const RepModel = {
  list() {
    return query<RepRecord>("SELECT * FROM reps ORDER BY name ASC");
  },

  findById(id: string) {
    return queryOne<RepRecord>("SELECT * FROM reps WHERE id = $1", [id]);
  },

  findBySlug(slug: string) {
    return queryOne<RepRecord>("SELECT * FROM reps WHERE slug = $1", [slug]);
  },
};
