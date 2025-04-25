import { describe, expect, it } from 'vitest'
import {
  escapeMarkdown,
  hasUserRepliedToReplica,
  removeMentionIfNeeded,
  voiceRequest,
} from './helpers'

describe('helpers', () => {
  const user = 'testuser'
  describe('removeMentionIfNeeded', () => {
    it('should remove mention from text when mention is provided', () => {
      const text = `Hello @${user} how are you?`
      const mention = user
      const result = removeMentionIfNeeded(text, mention)
      expect(result).toBe('Hello how are you?')
    })

    it('should not modify text when mention is empty', () => {
      const text = `Hello @${user} how are you?`
      const mention = ''
      const result = removeMentionIfNeeded(text, mention)
      expect(result).toBe(text)
    })

    it('should handle multiple mentions', () => {
      const text = `Hello @${user} and @${user} again`
      const mention = user
      const result = removeMentionIfNeeded(text, mention)
      expect(result).toBe('Hello and again')
    })
  })

  describe('hasUserRepliedToReplica', () => {
    it('should return false when there is no reply', () => {
      const result = hasUserRepliedToReplica(undefined, user)
      expect(result).toBe(false)
    })

    it('should return true when user has replied with text', () => {
      const reply = {
        text: 'This is a reply',
        from: user,
        voice: false,
        caption: undefined,
      }
      const result = hasUserRepliedToReplica(reply, user)
      expect(result).toBe(true)
    })

    it('should return false when reply is from different user', () => {
      const reply = {
        text: 'This is a reply',
        from: 'otheruser',
        voice: false,
        caption: undefined,
      }
      const result = hasUserRepliedToReplica(reply, user)
      expect(result).toBe(false)
    })
  })

  describe('escapeMarkdown', () => {
    it('should escape special markdown characters', () => {
      const text = '*bold* [link](url) ~strike~ `code` >quote #header'
      const result = escapeMarkdown(text)
      expect(result).toBe(
        '\\*bold\\* \\[link\\]\\(url\\) \\~strike\\~ \\`code\\` \\>quote \\#header',
      )
    })

    it('should escape underscores', () => {
      const text = 'some_text_with_underscores'
      const result = escapeMarkdown(text)
      expect(result).toBe('some\\_text\\_with\\_underscores')
    })
  })

  describe('voiceRequest', () => {
    it('should detect voice message request', async () => {
      const input = 'hey OpenAI, tell me what time it is with a voice message'
      const result = await voiceRequest(input)
      expect(result.voice_requested).toBe(true)
    })

    it('should not detect voice message request in normal text', async () => {
      const input = 'what is the price of the car'
      const result = await voiceRequest(input)
      expect(result.voice_requested).toBe(false)
    })
  })
})
