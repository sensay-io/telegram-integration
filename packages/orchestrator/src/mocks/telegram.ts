import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const BASE_TELEGRAM_API_URL = 'https://api.telegram.org'

const GET_ME_URL = new RegExp(`${BASE_TELEGRAM_API_URL}/bot.*/getMe`)
const getMe = http.post(GET_ME_URL, ({ request, params }) => {
  const botToken = request.url.replace(`${BASE_TELEGRAM_API_URL}/bot`, '').split('/')[0]
  const user = {
    id: 1,
    username: botToken,
  }
  return HttpResponse.json({
    ok: true,
    result: user,
  })
})

const DELETE_WEBHOOK_URL = new RegExp(`${BASE_TELEGRAM_API_URL}/bot.*/deleteWebhook`)
const deleteWebhook = http.post(DELETE_WEBHOOK_URL, (...args) => {
  return HttpResponse.json({
    ok: true,
  })
})

const GET_UPDATES_URL = new RegExp(`${BASE_TELEGRAM_API_URL}/bot.*/getUpdates`)
const getUpdates = http.post(GET_UPDATES_URL, async (...args) => {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return HttpResponse.json({
    ok: true,
    result: [],
  })
})

export function setupMocks() {
  const server = setupServer()
  server.events.on('request:start', ({ request }) => {
    console.log('Outgoing:', request.method, request.url)
  })
  server.use(getMe, deleteWebhook, getUpdates)
  return { server }
}
