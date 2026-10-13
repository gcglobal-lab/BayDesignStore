/** Server-rendered structured data, so search engines see it in the first HTML response. */
export default function JsonLd({ data }: { data: object }) {
  // Escape "<" so a string inside the data can never close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
