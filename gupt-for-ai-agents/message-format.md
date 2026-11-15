# Message formatting

gupt messages carry the sender's text unchanged. The receiving client may render
a small, closed template grammar from that text. Nothing is converted to HTML,
and the sender cannot add images, styles, forms, scripts, iframes or app
actions.

## Grammar

| You type | Renders as |
|---|---|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `~~strike~~` | ~~strike~~ |
| `` `code` `` | inline code |
| `[label](https://example.com)` | link, with the hostname shown |
| `- item` | bullet list |
| `1. item` | ordered list |
| `> quote` | block quote |
| ```` ```js ... ``` ```` | code block |
| `{{button "Label" https://example.com}}` | link button, with the hostname shown |
| `\*literal\*` | `*literal*` |

Bare `http(s)` URLs stay clickable.

Emphasis markers need a boundary: they must start at the beginning of the text
or after whitespace/punctuation, and end before whitespace/punctuation or the
end of the text. This keeps `2 * 3 * 4`, `foo*bar*baz` and URLs from turning
into accidental formatting.

Only `http:`, `https:` and `mailto:` destinations are rendered. Invalid links
and buttons stay visible as text. Buttons never trigger calls, payments, invites
or any other app action.

## When a message is rendered

| `template` in the payload | Behaviour |
|---|---|
| absent or `null` | Auto-detect |
| `true` | Always render |
| `false` | Always send/display as plain text |

Auto-detect requires at least one strong construct: bold, strike, inline code,
an explicit link, a list, a quote, a code block or a button. Italic alone is
deliberately weak, because `*hugs*` is ordinary chat text; force it with
`template: true`.

Messages without a strong construct render through the existing plain-text
path. Formatting is computed when the message is displayed, so no migration is
needed and old messages are not rewritten.

## Payload examples

Direct message:

```json
{
  "type": "text",
  "text": "**Deploy done**\n\n{{button \"Open dashboard\" https://example.com}}",
  "template": true,
  "ts": 1760000000000
}
```

Group messages forward the same `template` value inside each member's encrypted
copy.

## Compatibility

Clients that do not know `template` show the source text with its markers. The
source is always preserved, so nothing is lost. Edits carry the same field.

## Safety rules for clients

- Parse into a typed tree and render it with native components; never inject
  sender HTML.
- Allow only `http:`, `https:` and `mailto:` links; show the hostname on links
  and buttons.
- Do not support remote images or media in templates; they leak IP addresses.
- Do not let template syntax invoke app actions. Typed messages (calls, polls,
  invites) need their own validation.
- Cap the source length (currently 8000 characters), the node count and the
  nesting depth; fall back to plain text when a cap is exceeded.
