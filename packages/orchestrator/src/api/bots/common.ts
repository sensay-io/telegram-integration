import { ReplicaUUIDSchema } from '@/bot_definition'
import { z } from 'zod'

export const ReplicaUUIDParameter = 'replicaUUID'

export const ReplicaUUIDParameterSchema = z.object({
  [ReplicaUUIDParameter]: ReplicaUUIDSchema.openapi(`${ReplicaUUIDParameter} parameter`, {
    param: {
      name: ReplicaUUIDParameter,
      in: 'path',
    },
    description: 'The UUID of the Replica',
  }),
})

export enum HTTPStatusCodes {
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  INTERNAL_SERVER_ERROR = 500,
}

export const commonErrorResponses = {
  [HTTPStatusCodes.BAD_REQUEST]: {
    description: 'Bad Request',
  },
  [HTTPStatusCodes.NOT_FOUND]: {
    description: 'Not Found',
  },
  [HTTPStatusCodes.INTERNAL_SERVER_ERROR]: {
    description: 'Internal Server Error',
  },
}
