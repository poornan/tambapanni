#!/usr/bin/env node
/**
 * generate-pages.js — Regenerate paper pages from source markdown
 *
 * Reads src/history.md and src/positioned.md from the main project,
 * extracts metadata, abstract, section headings, and generates
 * papers/history.qmd and papers/positioned.qmd.
 *
 * Preserves: DOI links, citation metadata, PDF paths (from existing .qmd)
 * Regenerates: abstract, key arguments/sections, version, frameworks
 *
 * Usage: node generate-pages.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.join(process.env.HOME, 'conversations/tambapanni-project');
const PAGES_DIR = path.join(process.env.HOME, 'conversations/tambapanni-pages');

const DOCS = [
  {
    key: 'history',
    src: path.join(PROJECT_DIR, 'src/history.md'),
    qmd: path.join(PAGES_DIR, 'papers/history.qmd'),
    pdf: 'pdf/1.%20Tambapanni_History_Without_Borders.pdf',
    pdfUrl: 'https://tambapanni.github.io/papers/pdf/1. Tambapanni_History_Without_Borders.pdf',
    url: 'https://tambapanni.github.io/papers/history.html',
    categories: '[political-economy, state-building, historiography, sri-lanka]',
    partNum: 1,
    companion: null,
  },
  {
    key: 'positioned',
    src: path.join(PROJECT_DIR, 'src/positioned.md'),
    qmd: path.join(PAGES_DIR, 'papers/positioned.qmd'),
    pdf: 'pdf/2.%20Tambapanni_Positioned.pdf',
    pdfUrl: 'https://tambapanni.github.io/papers/pdf/2. Tambapanni_Positioned.pdf',
    url: 'https://tambapanni.github.io/papers/positioned.html',
    categories: '[political-economy, state-building, institutional-reform, sri-lanka]',
    partNum: 2,
    companion: 'history',
  },
];

// ── Parse source markdown ───────────────────────────────────────────────

function parseFrontMatter(raw) {
  const match = raw.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

function extractAbstract(raw) {
  // Strip YAML front matter
  const body = raw.replace(/^---\n[\s\S]+?\n---\n/, '');
  const lines = body.split('\n');

  // Find the first H1, then get the first substantial paragraph(s)
  // For history: the preamble note + first paragraph
  // For positioned: the executive summary

  // Strategy: find first non-heading, non-blockquote paragraph after first H1
  let inBody = false;
  const paragraphs = [];
  let currentPara = [];

  for (const line of lines) {
    if (line.match(/^# /)) { inBody = true; continue; }
    if (!inBody) continue;

    // Skip callout boxes, blockquotes
    if (line.match(/^>\s*\*\*/)) continue;
    if (line.match(/^>/)) continue;
    if (line.match(/^##\s/)) {
      // Hit next section — stop collecting
      if (paragraphs.length >= 2) break;
      continue;
    }

    if (line.trim() === '') {
      if (currentPara.length > 0) {
        const text = currentPara.join(' ').trim();
        // Skip very short lines and citation-only lines
        if (text.length > 100) {
          paragraphs.push(text);
        }
        currentPara = [];
      }
    } else {
      currentPara.push(line.trim());
    }
  }
  if (currentPara.length > 0) {
    const text = currentPara.join(' ').trim();
    if (text.length > 100) paragraphs.push(text);
  }

  // Take first 2-3 paragraphs, strip citations [N]
  return paragraphs.slice(0, 3)
    .join('\n\n')
    .replace(/\[[\d,\s]+\]/g, '')
    .replace(/\\\'/g, "'")
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .trim();
}

function extractSections(raw) {
  const body = raw.replace(/^---\n[\s\S]+?\n---\n/, '');
  const headings = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^# ([IVX]+\.\s+.+)/);
    if (m) headings.push(m[1]);
  }
  return headings;
}

function extractH2Sections(raw) {
  const body = raw.replace(/^---\n[\s\S]+?\n---\n/, '');
  const headings = [];
  for (const line of body.split('\n')) {
    // Skip glossary, references, appendix H2s
    if (line.match(/^## (Historical|Specialist|Abbreviation)/)) continue;
    const m = line.match(/^## (.+)/);
    if (m && !m[1].match(/^(Sources|What a Modern|Sri Lanka Democratized|The Lens)/)) {
      headings.push(m[1].trim());
    }
  }
  return headings;
}

function extractKeyArguments(raw, docKey) {
  const sections = extractSections(raw);

  if (docKey === 'history') {
    // Extract from the section content — key claims
    return [
      { bold: 'The Vijaya origin is a geography argument, not a culture argument.',
        text: "The Mahavamsa's Lala points to the Gujarat/Rajasthan coast, not Bengal." },
      { bold: 'The Nayak kings disprove primordial exclusivism.',
        text: 'Four Telugu Hindu rulers became the greatest patrons of Sinhala Buddhism. The categories were socially real but not politically exclusivist.' },
      { bold: 'Colonial administration manufactured fixed categories.',
        text: 'The 1871 census, Orientalist philology, and premature democratisation created the conditions for ethnic patronage competition.' },
      { bold: 'The Sinhala Only Act is a sequencing failure, not ethnic hatred.',
        text: 'Pre-existing cultural difference was the fuel. Democratic competition without constitutional constraint was the ignition.' },
      { bold: 'Dynastic competition was not ethnic warfare.',
        text: 'Chola, Polonnaruwa, and Magha episodes were political events within a connected civilisation, not invasions across an ethnic boundary.' },
    ];
  } else {
    // For positioned, extract the three arguments from executive summary
    return [
      { bold: 'The window is real and time-limited.',
        text: 'The macroeconomic conditions that enabled Singapore, Taiwan, South Korea, Estonia, Rwanda, and Mauritius to leap forward each operated within a specific temporal window.' },
      { bold: 'Capturing the window requires institutional reform, not infrastructure spending.',
        text: 'The construction of an impartial state apparatus prior to ethnicity and religion in its founding logic.' },
      { bold: 'The agent of reform is not the state itself',
        text: 'but a coalition of actors who share a forward-looking myth of national identity: prosperity as the shared telos.' },
    ];
  }
}

function detectFrameworks(raw) {
  const frameworks = [];
  if (raw.includes('Fukuyama') || raw.includes('sequencing'))
    frameworks.push({ name: 'Fukuyama', desc: 'Institutional sequencing: the impartial state must precede democratic accountability' });
  if (raw.includes('Mahbubani') || raw.includes('trusted advisor'))
    frameworks.push({ name: 'Mahbubani', desc: 'The reader concludes, not the author; intelligence shared, not verdicts delivered' });
  if (raw.includes('Dellanna') || raw.includes('ergodic'))
    frameworks.push({ name: 'Dellanna', desc: 'Ergodicity, absorbing barriers, the power law trap for the majority' });
  if (raw.includes('Snowden') || raw.includes('Cynefin') || raw.includes('Estuarine'))
    frameworks.push({ name: 'Snowden', desc: 'Complex-domain navigation, Estuarine mapping for implementation' });
  if (raw.includes('Ackoff') || raw.includes('reactivis'))
    frameworks.push({ name: 'Ackoff', desc: 'Reactivism (recovering an idealised past) is the planning error' });
  return frameworks;
}

// ── Read existing DOI from .qmd ─────────────────────────────────────────

function getExistingDoi(qmdPath) {
  if (!fs.existsSync(qmdPath)) return null;
  const content = fs.readFileSync(qmdPath, 'utf8');
  const m = content.match(/doi:\s*(10\.\d+\/\S+)/);
  return m ? m[1] : null;
}

// ── Generate .qmd ───────────────────────────────────────────────────────

function generateQmd(doc) {
  const raw = fs.readFileSync(doc.src, 'utf8');
  const fm = parseFrontMatter(raw);
  const abstract = extractAbstract(raw);
  const keyArgs = extractKeyArguments(raw, doc.key);
  const frameworks = detectFrameworks(raw);
  const existingDoi = getExistingDoi(doc.qmd);

  const title = [fm.title, fm.subtitle].filter(Boolean).join(': ');
  const version = fm.version || 'v1.0';

  // Wrap abstract for YAML (indent each line)
  const yamlAbstract = abstract.split('\n').map(l => '  ' + l).join('\n');

  // DOI links
  const doiLine = existingDoi
    ? `[DOI: ${existingDoi}](https://doi.org/${existingDoi}){.btn .btn-outline-secondary}`
    : '[DOI (coming soon)](#){.btn .btn-outline-secondary title="Coming soon"}';

  // Key arguments / sections
  let keySection;
  if (doc.key === 'history') {
    keySection = '### Key Arguments\n\n' +
      keyArgs.map(a => `- **${a.bold}** ${a.text}`).join('\n\n');
  } else {
    // For positioned, use H2 headings as "Key Sections"
    const h2s = extractH2Sections(raw);
    keySection = '### Key Sections\n\n' +
      h2s.slice(0, 8).map(h => `- **${h}**`).join('\n');
  }

  // Frameworks
  const frameworkSection = '### Frameworks Applied\n\n' +
    frameworks.map(f => `- **${f.name}** — ${f.desc}`).join('\n');

  // Companion line
  const companionLine = doc.companion
    ? `\n**Companion to:** [Tambapanni: A History Without Borders](${doc.companion}.qmd)\n`
    : '';

  // Citation DOI in front matter
  const doiFm = existingDoi ? `\n  doi: ${existingDoi}` : '';

  const qmd = `---
title: "${fm.title}: ${fm.subtitle || ''}"
subtitle: "${fm.tagline || fm.subtitle || ''}"
date: 2026-03-01
author:
  - name: ${fm.author || 'Ananthaneshan Elampoornan'}
    orcid: ${fm.orcid || '0009-0004-9181-2270'}
google-scholar: true
citation:
  type: article
  container-title: "Tambapanni White Paper Series"
  issued: 2026-03
  url: ${doc.url}
  pdf-url: ${doc.pdfUrl}${doiFm}
categories: ${doc.categories}
abstract: |
${yamlAbstract}
---

## Part ${doc.partNum} of the Tambapanni Series

**Status:** Complete · ${version} · March 2026
${companionLine}
### Abstract

${abstract}

${keySection}

${frameworkSection}

### Downloads

[Download PDF](${doc.pdf}){.btn .btn-primary} ${doiLine}

### Citation

${fm.cite_as || `Elampoornan, A. (2026). *${title}.* ORCID: [0009-0004-9181-2270](https://orcid.org/0009-0004-9181-2270)`}

---

[← Back to series overview](../index.qmd)
`;

  return qmd;
}

// ── Generate index landing page cards ───────────────────────────────────

function generateIndexCards() {
  const cards = [];

  for (const doc of DOCS) {
    const raw = fs.readFileSync(doc.src, 'utf8');
    const fm = parseFrontMatter(raw);
    const abstract = extractAbstract(raw);
    const version = fm.version || 'v1.0';
    const existingDoi = getExistingDoi(doc.qmd);

    // First paragraph only for the card
    const shortAbstract = abstract.split('\n\n')[0];

    const doiLink = existingDoi
      ? `[DOI: ${existingDoi}](https://doi.org/${existingDoi})`
      : '[DOI (coming soon)](#){title="Coming soon"}';

    cards.push({
      key: doc.key,
      title: fm.title + (fm.subtitle ? ': ' + fm.subtitle : ''),
      subtitle: fm.tagline || fm.subtitle || '',
      version,
      shortAbstract,
      pdf: `papers/${doc.pdf}`,
      doiLink,
      partNum: doc.partNum,
    });
  }

  return cards;
}

// ── Main ────────────────────────────────────────────────────────────────

console.log('Generating paper pages from source...\n');

for (const doc of DOCS) {
  const qmd = generateQmd(doc);
  fs.writeFileSync(doc.qmd, qmd);
  console.log(`  ${doc.key}.qmd: ${qmd.split('\n').length} lines`);
}

// Generate index card data for manual insertion
const cards = generateIndexCards();
console.log('\n  Index card data:');
for (const card of cards) {
  console.log(`    Part ${card.partNum}: ${card.version} — ${card.shortAbstract.substring(0, 60)}...`);
}

// Update index.qmd version numbers and abstracts
const indexPath = path.join(PAGES_DIR, 'index.qmd');
if (fs.existsSync(indexPath)) {
  let index = fs.readFileSync(indexPath, 'utf8');

  for (const card of cards) {
    // Update version in the paper card
    const titlePattern = card.key === 'history'
      ? 'History Without Borders'
      : 'Tambapanni Positioned';

    // Replace version string after the title
    const versionRegex = new RegExp(
      `(${titlePattern}[\\s\\S]*?Complete · )v[0-9.]+`,
      ''
    );
    index = index.replace(versionRegex, `$1${card.version}`);

    // Replace the abstract paragraph in the card
    // Find the paragraph between paper-status and paper-links for this paper
  }

  fs.writeFileSync(indexPath, index);
  console.log(`\n  index.qmd: versions updated`);
}

console.log('\nDone. Review with: cd ~/conversations/tambapanni-pages && quarto preview');
