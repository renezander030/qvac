## MODIFIED Requirements

### Requirement: SDK collection composition

The `sdk` collection SHALL hold the material about installing, configuring, and using the SDK, and MUST receive every existing page not claimed by another collection. The former `introduction.mdx` MUST become the collection overview. Because the collection is versioned, those pages MUST live inside a documentation-line folder rather than directly under the collection, and the API reference and release notes MUST keep only their current series, since the patch-series archives are superseded by the line model and belong to the Software Inventory.

#### Scenario: Introduction becomes the SDK overview

- **WHEN** the `sdk` collection is enumerated
- **THEN** it contains an overview page whose content is the former `introduction.mdx`

#### Scenario: SDK receives the remaining existing pages

- **WHEN** a documentation line of the `sdk` collection is enumerated
- **THEN** it contains the former `quickstart.mdx`, `system-requirements.mdx`, `installation.mdx`, and `troubleshooting.mdx`
- **AND** it contains the former `configuration/**`, `models/**`, `ai-capabilities/**`, `p2p-capabilities/**`, `runtime/**`, and `tutorials/**` pages
- **AND** it contains the former `reference/api/index.mdx` and `reference/release-notes/index.mdx`
- **AND** it contains the former `cli/index.mdx`

#### Scenario: Every SDK page sits inside a line

- **WHEN** the `sdk` collection folder is enumerated
- **THEN** every page under it sits inside a documentation-line folder

#### Scenario: The patch-series archives leave the published set

- **WHEN** the former `reference/api/v*.mdx` and `reference/release-notes/v*.mdx` pages are enumerated
- **THEN** none of them is published
- **AND** each is retained unpublished, with its former URL redirecting to the current series

### Requirement: Provider collection composition

The `provider` collection SHALL hold the material about installing, configuring, and connecting the model provider server. It MUST be composed from the existing HTTP-server pages plus a single new overview page. Because the collection is versioned, those pages MUST live inside a documentation-line folder rather than directly under the collection.

#### Scenario: Provider receives the HTTP-server pages

- **WHEN** a documentation line of the `provider` collection is enumerated
- **THEN** it contains the former `cli/http-server/index.mdx`, `cli/http-server/connection.mdx`, and `cli/http-server/integration.mdx`

#### Scenario: Every Provider page sits inside a line

- **WHEN** the `provider` collection folder is enumerated
- **THEN** every page under it sits inside a documentation-line folder

#### Scenario: Provider sections without existing content are not authored

- **WHEN** the `provider` collection is enumerated
- **THEN** it contains no page for the anticipated Installation, Configuration, API reference, or Troubleshooting sections, because no existing page covers them

## REMOVED Requirements

### Requirement: No content authored beyond two declared exceptions

**Reason**: The constraint scoped the reorganization, which moved pages without writing any. This change both duplicates pages into a second documentation line and authors the Software Inventory, so a prohibition on authoring cannot hold.

**Migration**: Content growth is governed per capability instead. `docs-versioning` requires a new line to start as an exact copy of the current one, and `software-inventory-docs` states what the inventory publishes. Neither permits editing a moved page's body outside those rules.
