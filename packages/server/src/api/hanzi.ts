import { FastifyInstance } from 'fastify'

import { hsk, zhToken } from '../db/local'
import { DbCardModel } from '../db/mongo'

export default (f: FastifyInstance, _: any, next: () => void) => {
  f.post(
    '/match',
    {
      schema: {
        tags: ['hanzi'],
        summary: 'Get data for a given Hanzi',
        body: {
          type: 'object',
          required: ['entry'],
          properties: {
            entry: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              result: {
                type: 'object',
                properties: {
                  sup: { type: 'string' },
                  sub: { type: 'string' },
                  variants: { type: 'string' },
                  pinyin: { type: 'string' },
                  english: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (req) => {
      const { entry } = req.body
      const { sub, sup, variants, pinyin, english } =
        zhToken.findOne({ entry }) || {}

      return {
        result: { sub, sup, variants, pinyin, english },
      }
    }
  )

  f.post(
    '/random',
    {
      schema: {
        tags: ['hanzi'],
        summary: 'Randomize a Hanzi for a given level',
        body: {
          type: 'object',
          properties: {
            levelMin: { type: 'integer' },
            level: { type: 'integer' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              result: { type: 'string' },
              level: { type: 'integer' },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const u = req.session.user
      if (!u || !u._id) {
        reply.status(401).send()
        return
      }

      const { levelMin, level } = req.body

      const hsMap = new Map<string, number>()

      Object.entries(hsk)
        .map(([lv, vs]) => ({ lv: parseInt(lv), vs }))
        .filter(({ lv }) => (level ? lv <= level : true))
        .filter(({ lv }) => (levelMin ? lv >= levelMin : true))
        .map(({ lv, vs }) => {
          vs.map((v) => {
            v.split('').map((h) => {
              const hLevel = hsMap.get(h)
              if (!hLevel || hLevel > lv) {
                hsMap.set(h, lv)
              }
            })
          })
        })

      const reviewing = new Set<string>(
        (
          await DbCardModel.aggregate([
            {
              $match: {
                userId: u._id,
                item: { $in: Array.from(hsMap.keys()) },
                type: 'hanzi',
              },
            },
            {
              $lookup: {
                from: 'quiz',
                localField: '_id',
                foreignField: 'cardId',
                as: 'q',
              },
            },
            {
              $match: { 'q.nextReview': { $exists: true } },
            },
            {
              $project: {
                _id: 0,
                item: 1,
              },
            },
          ])
        ).map((el) => el.item)
      )

      const hs = Array.from(hsMap).filter(([h]) => !reviewing.has(h))
      if (hs.length === 0) {
        return {}
      }

      const [h, lv] = hs[Math.floor(Math.random() * hs.length)]

      return {
        result: h,
        level: lv,
      }
    }
  )

  next()
}
