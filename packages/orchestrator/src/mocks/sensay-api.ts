import { URL } from 'node:url'
import { config } from '@/config'
import { faker } from '@faker-js/faker'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const UUID_TEMPLATE = '00000000-0000-0000-0000-000000000000'

const createFakeReplica = (id: number) => {
  const uuid = id > 9 ? faker.string.uuid() : UUID_TEMPLATE.replaceAll(/0/g, id.toString())

  return {
    uuid,
    name: `replica-${id}`,
    slug: `replica-${id}`,
    telegram_integration: {
      service_name: config.TELEGRAM_SERVICE_NAME,
      token: `token-${id}`,
    },
  }
}

const createFakeReplicas = (count: number) => {
  return Array.from({ length: count }, (_, id) => createFakeReplica(id))
}

const getUser = http.get(`${config.SENSAY_API_URL}/v1/users/me`, () => {
  return HttpResponse.json()
})

const getReplicas = (n: number) => {
  const replicas = createFakeReplicas(n)
  return http.get(`${config.SENSAY_API_URL}/v1/replicas`, ({ request }) => {
    console.log('getReplicas', request.url)
    const url = new URL(request.url)

    const slug = url.searchParams.get('slug')
    if (slug) {
      const filtered = replicas.filter((replica) => replica.slug === slug)
      return HttpResponse.json({
        success: true,
        type: 'replicas',
        items: filtered,
        total: filtered.length,
      })
    }

    const integration = url.searchParams.get('integration')
    if (integration === 'telegram') {
      return HttpResponse.json({
        success: true,
        type: 'replicas',
        items: replicas,
        total: replicas.length,
      })
    }

    return HttpResponse.json([])
  })
}

export function setupMocks() {
  const server = setupServer()

  server.events.on('request:start', ({ request }) => {
    console.log('Outgoing:', request.method, request.url)
  })

  return { server, getUser, getReplicas }
}
