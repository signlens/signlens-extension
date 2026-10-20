// A release's notes: its section of CHANGELOG.md, then how to check the
// packages it carries. `node scripts/release-notes.ts 0.1.0 [file]` writes
// them, to the file or to the terminal. The release workflow publishes
// them as the release's body, and refuses a version the changelog has no
// section for, so a release never goes out without saying what it is.

import { readFileSync, writeFileSync } from 'node:fs';

const REPOSITORY = 'https://github.com/signlens/signlens-extension';

/**
 * The body of `version`'s section of a Keep a Changelog file: what follows
 * its `## [version]` heading up to the next section or the link
 * definitions at the end, or `null` when it has none or it is empty.
 */
export function changelogSection(changelog: string, version: string): string | null {
    const lines = changelog.split('\n');
    const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
    if (start < 0) return null;
    const body: string[] = [];
    for (const line of lines.slice(start + 1)) {
        if (line.startsWith('## ') || /^\[[^\]]+\]: /.test(line)) break;
        body.push(line);
    }
    const text = body.join('\n').trim();
    return text === '' ? null : text;
}

/** The notes of release `version`: its changelog section and how to check its packages. Throws when the changelog has none. */
export function releaseNotes(changelog: string, version: string): string {
    const section = changelogSection(changelog, version);
    if (section === null)
        throw new Error(`CHANGELOG.md has no section for ${version}: add "## [${version}] - <date>" with what it changes`);
    const chrome = `signlens-extension-${version}.zip`;
    const firefox = `signlens-extension-firefox-${version}.zip`;
    return `${section}

### Checking the packages

\`${chrome}\` is the Chrome package and \`${firefox}\` the Firefox one. In the directory you downloaded them to, with their \`.sha256\` files:

\`\`\`sh
sha256sum -c ${chrome}.sha256 ${firefox}.sha256
gh attestation verify ${chrome} --owner signlens
gh attestation verify ${firefox} --owner signlens
\`\`\`

The tag rebuilds to the same bytes: see [Verifying a package](${REPOSITORY}#verifying-a-package).
`;
}

if (import.meta.main) {
    const [version, file] = process.argv.slice(2);
    if (!version) {
        console.error('usage: node scripts/release-notes.ts <version> [file]');
        process.exit(1);
    }
    try {
        const notes = releaseNotes(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), version);
        if (file) writeFileSync(file, notes);
        else process.stdout.write(notes);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
