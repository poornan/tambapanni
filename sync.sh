#!/usr/bin/env bash
# Sync PDFs from main project and update DOI links from .zenodo.json
#
# Usage: ./sync.sh
#
# Run after: ./tambapanni.sh tag "..." && ./tambapanni.sh pdf

set -euo pipefail

PAGES_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$HOME/conversations/tambapanni-project"
ZENODO_STATE="$PROJECT_DIR/.zenodo.json"
PDF_DIR="$PAGES_DIR/papers/pdf"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Step 1: Copy PDFs ──────────────────────────────────────────────────────

echo -e "${BLUE}[1/3] Syncing PDFs from main project...${NC}"

HISTORY_PDF="$PROJECT_DIR/output/1. Tambapanni_History_Without_Borders.docx"
POSITIONED_PDF="$PROJECT_DIR/output/2. Tambapanni_Positioned.docx"

if [ -f "$HISTORY_PDF" ] && [ -f "$POSITIONED_PDF" ]; then
    libreoffice --headless --convert-to pdf --outdir "$PDF_DIR" "$HISTORY_PDF" 2>/dev/null
    libreoffice --headless --convert-to pdf --outdir "$PDF_DIR" "$POSITIONED_PDF" 2>/dev/null
    echo -e "${GREEN}  PDFs updated.${NC}"
else
    echo -e "${RED}  Docx files not found. Run './tambapanni.sh build' first.${NC}"
fi

# ── Step 2: Update versions from source front matter ────────────────────────

echo -e "${BLUE}[2/3] Updating version numbers...${NC}"

h_ver=$(grep -m1 '^version:' "$PROJECT_DIR/src/history.md" | sed 's/version:\s*//')
p_ver=$(grep -m1 '^version:' "$PROJECT_DIR/src/positioned.md" | sed 's/version:\s*//')

if [ -n "$h_ver" ]; then
    sed -i "s/Complete · v[0-9.]* · /Complete · $h_ver · /" "$PAGES_DIR/papers/history.qmd"
    # Update on landing page too (Part 1 card)
    sed -i "0,/Complete · v[0-9.]*/s/Complete · v[0-9.]*/Complete · $h_ver/" "$PAGES_DIR/index.qmd"
    echo "  History: $h_ver"
fi

if [ -n "$p_ver" ]; then
    sed -i "s/Complete · v[0-9.]* · /Complete · $p_ver · /" "$PAGES_DIR/papers/positioned.qmd"
    # Update on landing page (Part 2 card — second occurrence)
    sed -i "0,/Complete · v[0-9.]*/{//!b; s/Complete · v[0-9.]*/Complete · $p_ver/}" "$PAGES_DIR/index.qmd"
    echo "  Positioned: $p_ver"
fi

# ── Step 3: Update DOI links if .zenodo.json exists ─────────────────────────

echo -e "${BLUE}[3/3] Checking DOI state...${NC}"

if [ ! -f "$ZENODO_STATE" ]; then
    echo "  No .zenodo.json found. DOI links unchanged."
    exit 0
fi

# Extract DOIs using node (already available)
update_doi() {
    local doc_key="$1"
    local qmd_file="$2"

    local doi
    local concept_doi
    local status

    doi=$(node -e "const s=require('$ZENODO_STATE'); const r=s['$doc_key']; if(r&&r.doi) console.log(r.doi); else console.log('')")
    concept_doi=$(node -e "const s=require('$ZENODO_STATE'); const r=s['$doc_key']; if(r&&r.concept_doi) console.log(r.concept_doi); else console.log('')")
    status=$(node -e "const s=require('$ZENODO_STATE'); const r=s['$doc_key']; if(r&&r.status) console.log(r.status); else console.log('')")

    if [ -z "$doi" ] || [ "$status" != "published" ]; then
        echo "  $doc_key: not published yet, skipping DOI update"
        return
    fi

    local doi_url="https://doi.org/$doi"

    # Update paper page: replace "DOI (coming soon)" with actual DOI link
    if grep -q "DOI (coming soon)" "$qmd_file"; then
        sed -i "s|DOI (coming soon).*{[^}]*}|DOI: $doi]($doi_url){.btn .btn-outline-secondary}|" "$qmd_file"
        echo "  $doc_key: DOI updated → $doi"
    else
        echo "  $doc_key: DOI already set"
    fi

    # Also update the citation DOI in front matter if not present
    if ! grep -q "doi:" "$qmd_file"; then
        sed -i "/^  pdf-url:/a\\  doi: $doi" "$qmd_file"
        echo "  $doc_key: citation.doi added to front matter"
    fi
}

update_doi "history" "$PAGES_DIR/papers/history.qmd"
update_doi "positioned" "$PAGES_DIR/papers/positioned.qmd"

# Update landing page DOI links
for doc_key in history positioned; do
    doi=$(node -e "const s=require('$ZENODO_STATE'); const r=s['$doc_key']; if(r&&r.doi&&r.status==='published') console.log(r.doi); else console.log('')")
    if [ -n "$doi" ]; then
        doi_url="https://doi.org/$doi"
        # The landing page has two paper-links sections; update the right one
        # by matching on the surrounding context
        if [ "$doc_key" = "history" ]; then
            sed -i "0,/\[DOI (coming soon)\]/s|\[DOI (coming soon)\](#){title=\"Coming soon\"}|[DOI: $doi]($doi_url)|" "$PAGES_DIR/index.qmd"
        else
            # Second occurrence
            sed -i "s|\[DOI (coming soon)\](#){title=\"Coming soon\"}|[DOI: $doi]($doi_url)|" "$PAGES_DIR/index.qmd"
        fi
    fi
done

echo -e "\n${GREEN}Sync complete.${NC}"
echo "Review changes with: git diff"
echo "Then: git add -A && git commit && git push"
