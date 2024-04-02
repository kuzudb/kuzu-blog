import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";

// Assuming you have a collection named "blog"
const blogs = await getCollection("post");

// Transform the collection into an object
const pages = Object.fromEntries(
  blogs.map(({ id, slug, data }) => [id, { data, slug }]),
);

export const { getStaticPaths, GET } = OGImageRoute({
    // The name of your dynamic route segment.
    // In this case it’s `route`, because the file is named `[...route].ts`.
    param: "route",
  
    // A collection of pages to generate images for.
    pages,
  
    // For each page, this callback will be used to customize the OG image.
    getImageOptions: async (_, { data, slug }: (typeof pages)[string]) => {
      return {
        title: data.title,
        description: data.description,
      };
    },
  });