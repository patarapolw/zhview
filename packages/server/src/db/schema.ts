import { prop, getModelForClass, index, Ref, setGlobalOptions, Severity } from '@typegoose/typegoose'
import { nanoid } from 'nanoid'
import dotProp from 'dot-prop'

import db from '.'
import { repeatReview, srsMap, getNextReview } from './quiz'

setGlobalOptions({ options: { allowMixed: Severity.ALLOW } })

export class DbUser {
  @prop({ required: true, unique: true }) email!: string
  @prop({ default: 1 }) levelMin!: number
  @prop({ default: 60 }) level!: number
}

export const DbUserModel = getModelForClass(DbUser, { schemaOptions: { collection: 'user', timestamps: true } })

@index({ userId: 1, type: 1, item: 1 }, { unique: true })
export class DbCard {
  @prop({ default: () => nanoid() }) _id!: string
  @prop({ required: true, index: true, ref: 'DbUser' }) userId!: Ref<DbUser>
  @prop({ required: true }) type!: string
  @prop({ required: true }) item!: string
  @prop({ default: () => [] }) tag!: string[]
}

export const DbCardModel = getModelForClass(DbCard, { schemaOptions: { collection: 'card', timestamps: true } })

class DbQuiz {
  @prop({ default: () => repeatReview() }) nextReview!: Date
  @prop({ default: 0 }) srsLevel!: number
  @prop({ default: () => ({}) }) stat!: {
    streak?: {
      right?: number
      wrong?: number
      maxRight?: number
      maxWrong?: number
    }
    lastRight?: Date
    lastWrong?: Date
  }

  @prop({ required: true }) cardId!: string

  markRight = this._updateSrsLevel(+1)
  markWrong = this._updateSrsLevel(-1)
  markRepeat = this._updateSrsLevel(0)

  private _updateSrsLevel (dSrsLevel: number) {
    return () => {
      if (!db.user) {
        throw new Error('Not logged in')
      }

      if (dSrsLevel > 0) {
        dotProp.set(this.stat, 'streak.right', dotProp.get(this.stat, 'streak.right', 0) + 1)
        dotProp.set(this.stat, 'streak.wrong', 0)
        dotProp.set(this.stat, 'lastRight', new Date())

        if (dotProp.get(this.stat, 'streak.right', 1) > dotProp.get(this.stat, 'streak.maxRight', 0)) {
          dotProp.set(this.stat, 'streak.maxRight', dotProp.get(this.stat, 'streak.right', 1))
        }
      } else if (dSrsLevel < 0) {
        dotProp.set(this.stat, 'streak.wrong', dotProp.get(this.stat, 'streak.wrong', 0) + 1)
        dotProp.set(this.stat, 'streak.right', 0)
        dotProp.set(this.stat, 'lastWrong', new Date())

        if (dotProp.get(this.stat, 'streak.wrong', 1) > dotProp.get(this.stat, 'streak.maxWrong', 0)) {
          dotProp.set(this.stat, 'streak.maxWrong', dotProp.get(this.stat, 'streak.wrong', 1))
        }
      }

      this.srsLevel += dSrsLevel

      if (this.srsLevel >= srsMap.length) {
        this.srsLevel = srsMap.length - 1
      }

      if (this.srsLevel < 0) {
        this.srsLevel = 0
      }

      if (dSrsLevel > 0) {
        this.nextReview = getNextReview(this.srsLevel)
      }
    }
  }
}

export const DbQuizModel = getModelForClass(DbQuiz, { schemaOptions: { collection: 'quiz', timestamps: true } })
