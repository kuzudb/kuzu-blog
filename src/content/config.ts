import { defineCollection, z } from 'astro:content';

const post = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    categories: z.array(z.string()).default(['others']),
    tags: z.array(z.string()).default(['others']),
    authors: z.array(z.any()).default(['team']),
    draft: z.boolean().default(false),
  }),
});

export const collections = { post };
