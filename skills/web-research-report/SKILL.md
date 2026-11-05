# Web Research Report Skill

## Purpose

Search public web pages, open selected results, extract readable text, and generate a concise research report.

## Allowed Tools

- `search_web`
- `open_web_page`
- `extract_page_text`
- `send_lark_message`
- `write_audit_note`

## Risk Level

Low.

## Output

The skill returns:

- `topic`
- `searchResults`
- `openedPages`
- `report`
- `delivery`, if Lark sending is requested

## Notes

This skill is an MVP web execution layer. It should be used for public web research and report drafting. Important facts should be verified before external publication or high-risk decisions.
