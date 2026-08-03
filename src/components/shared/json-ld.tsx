interface JsonLdProps {
  /** A schema.org object from `@/lib/marketplace/structured-data`. */
  data: unknown;
}

/**
 * Emits structured data as a JSON-LD script tag.
 *
 * `dangerouslySetInnerHTML` is required and is safe here: the argument is an
 * object this codebase constructs, serialised by `JSON.stringify`, never a raw
 * string from a request. React would otherwise escape the JSON's quotes into
 * entities and a crawler would fail to parse it.
 *
 * `</` is escaped because a string ending up inside this JSON that contained
 * `</script>` would close the tag early - the one injection route a stringified
 * object still leaves open. Category names come from the database, so this is not
 * hypothetical.
 */
function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export { JsonLd };
