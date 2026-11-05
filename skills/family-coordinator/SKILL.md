# Family Coordinator Skill

Use this skill when the user wants the local agent to arrange family affairs from approved text input.

The skill can:

- create family events;
- create household tasks;
- create shopping items;
- avoid duplicate shopping entries;
- calculate privacy-aware reminder recipients;
- send a Lark update when requested.

Example input:

```json
{
  "text": "Lisa football match on 2026-09-05; John buy milk by 2026-09-01; surprise birthday for Lisa on 2026-09-10",
  "sendLark": false
}
```

Safety rules:

- Only approved text input is processed.
- The skill writes to local family plan data only.
- It does not control phones, private messages, payments, or external calendars.
- Lark sending is optional and uses the configured delivery channel.
