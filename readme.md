
## run slack bot

wrangler dev --port 3000

cloudflared tunnel --url http://localhost:3000

update URL in slack here: https://api.slack.com/apps/A07KDHZA4SG/event-subscriptions

## deploy 

wrangler deploy