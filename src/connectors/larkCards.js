function truncate(value, max = 650) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n...` : text;
}

export function createApprovalInteractiveCard({ approvalRequest, toolName, skillName }) {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: "Approval Required",
      },
      template: "orange",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            `**Skill:** ${skillName || "unknown"}`,
            `**Tool:** ${toolName || approvalRequest.tool}`,
            `**Risk:** ${approvalRequest.riskLevel}`,
            `**Approval ID:** ${approvalRequest.id}`,
            `**Reason:** ${approvalRequest.reason}`,
          ].join("\n"),
        },
      },
      {
        tag: "hr",
      },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**Preview**\n${truncate(approvalRequest.preview)}`,
        },
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: {
              tag: "plain_text",
              content: "Approve",
            },
            type: "primary",
            value: {
              action: "approve",
              approvalId: approvalRequest.id,
            },
          },
          {
            tag: "button",
            text: {
              tag: "plain_text",
              content: "Reject",
            },
            type: "danger",
            value: {
              action: "reject",
              approvalId: approvalRequest.id,
            },
          },
        ],
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "Buttons require the local callback server to be reachable by Lark.",
          },
        ],
      },
    ],
  };
}

export function createFamilyTodoInteractiveCard({ todos }) {
  const tasks = todos.tasks || [];
  const shopping = todos.shopping || [];
  const elements = [];

  if (!tasks.length && !shopping.length) {
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: "All done. No open family todos.",
      },
    });
  }

  for (const task of tasks) {
    elements.push(...createTodoRow({
      kind: "task",
      id: task.id,
      title: task.title,
      assignee: task.assignee,
      dueDate: task.dueDate,
    }));
  }

  for (const item of shopping) {
    elements.push(...createTodoRow({
      kind: "shopping",
      id: item.id,
      title: `Buy ${item.item}`,
      assignee: item.assignee,
      dueDate: item.dueDate,
    }));
  }

  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: "Tap Done after finishing a task. The local family plan will be updated by the callback server.",
      },
    ],
  });

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: "Family Todo List",
      },
      template: "blue",
    },
    elements,
  };
}

function createTodoRow({ kind, id, title, assignee, dueDate }) {
  const details = [
    `**${title}**`,
    assignee ? `Owner: ${assignee}` : "",
    dueDate ? `Due: ${dueDate}` : "",
  ].filter(Boolean);

  return [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: `☐ ${details.join("\\n")}`,
      },
    },
    {
      tag: "action",
      actions: [
      {
        tag: "button",
        text: {
          tag: "plain_text",
          content: "Done",
        },
        type: "primary",
        value: {
          action: "complete_todo",
          kind,
          id,
        },
      },
      ],
    },
  ];
}
