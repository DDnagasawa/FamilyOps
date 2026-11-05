# Daily Briefing Skill

## Purpose

Generate a concise daily briefing from authorised local context and optionally send it through Lark.

## Allowed Tools

- `read_context`
- `read_real_sources`
- `send_lark_message`
- `write_audit_note`

## Risk Level

Low.

## Output

The skill returns:

- `briefing`
- `delivery`, if Lark sending is requested
