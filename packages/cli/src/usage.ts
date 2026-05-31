export const usage = `Usage:
  mrtdown [--data-dir <path>] validate [--scope <scope>]
  mrtdown [--data-dir <path>] list <station|line|service|operator|town|landmark|issue>
  mrtdown [--data-dir <path>] show <station|line|service|operator|town|landmark|issue> <id>
  mrtdown [--data-dir <path>] issue state <id>
  mrtdown [--data-dir <path>] schematic-map list <constraint|version>
  mrtdown [--data-dir <path>] schematic-map show <manifest|rules|constraint|version> [id]
  mrtdown [--data-dir <path>] schematic-map select <YYYY-MM|YYYY-MM-DD>
  mrtdown [--data-dir <path>] schematic-map stats <YYYY-MM>
  mrtdown [--data-dir <path>] schematic-map diff <from YYYY-MM> <to YYYY-MM>
  mrtdown [--data-dir <path>] schematic-map generator-diff <from YYYY-MM> <to YYYY-MM>
  mrtdown [--data-dir <path>] schematic-map copy-constraints <from YYYY-MM> <to YYYY-MM> [--write] [--force]
  mrtdown [--data-dir <path>] schematic-map generate <YYYY-MM> [--generated-at <timestamp>] [--write]
  mrtdown [--data-dir <path>] schematic-map preview <YYYY-MM> [--out <path>]
  mrtdown [--data-dir <path>] create issue --date <YYYY-MM-DD> --title <title> [--slug <slug>] [--type <type>] [--source <source>]
  mrtdown [--data-dir <path>] create <station|line|service|operator|town|landmark> --file <path>
  mrtdown id issue --date <YYYY-MM-DD> --title <title>
  mrtdown [--data-dir <path>] manifest [--write]
  mrtdown [--data-dir <path>] pages-index [--write]
`;
