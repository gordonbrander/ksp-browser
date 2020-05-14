import { html, nothing, View } from './view/html'
import { Simlinks, Simlink, InputSimilar } from './protocol'
import { viewList } from './view/list'
import { view as viewResource } from './view/resource'
import { request } from './runtime'
import {
  AgentInbox,
  AgentOwnInbox,
  SimilarResponse,
  SimilarRequest,
  Rect,
  SelectionChange,
  SelectionData,
} from './mailbox'

type Message = AgentInbox

enum Status {
  Idle = 'idle',
  Pending = 'pending',
  Ready = 'ready',
}

type Idle = { status: Status.Idle; query: null; result: null }
type Pending = { status: Status.Pending; query: Query; result: null }
type Ready = { status: Status.Ready; query: Query; result: Simlinks }

export type Query = {
  id: number
  input: InputSimilar
  rect: Rect
}
export type Model = Idle | Pending | Ready

export const idle = (): Model => {
  return { status: Status.Idle, query: null, result: null }
}

export const init = idle

export const update = (
  message: SimilarResponse | SelectionChange,
  state: Model
): [Model, null | Promise<null | Message>] => {
  switch (message.type) {
    case 'SelectionChange': {
      return updateSelection(message.data, state)
    }
    case 'SimilarResponse': {
      return complete(message, state)
    }
  }
}

const updateSelection = (
  data: SelectionData | null,
  state: Model
): [Model, null | Promise<null | Message>] => {
  if (data) {
    const { content, url, id, rect } = data
    return query({ input: { content, url }, id, rect }, state)
  } else {
    return [idle(), null]
  }
}

export const query = (query: Query, state: Model): [Model, null | Promise<null | Message>] => {
  switch (state.status) {
    case Status.Idle: {
      return [{ status: Status.Pending, query, result: null }, similar(query)]
    }
    case Status.Ready:
    case Status.Pending: {
      if (query.input.content.length < 4) {
        return [idle(), null]
      } else if (query.input.content != state.query.input.content) {
        return [{ status: Status.Pending, query, result: null }, similar(query)]
      } else {
        return [state, null]
      }
    }
  }
}

export const complete = (
  message: SimilarResponse,
  state: Model
): [Model, null | Promise<null | Message>] => {
  if (state.status === Status.Pending && state.query.id === message.id) {
    return [{ status: Status.Ready, query: state.query, result: message.similar }, null]
  } else {
    return [state, null]
  }
}

const similar = async (query: Query): Promise<AgentInbox | null> => {
  const response = await request({
    type: 'SimilarRequest',
    input: query.input,
    rect: query.rect,
    id: query.id,
  })
  return response
}

const toReady = (state: Model): Ready | null => {
  switch (state.status) {
    case Status.Idle:
    case Status.Pending:
      return null
    case Status.Ready:
      return state
  }
}

export const view = (state: Model): View => viewSidebar(state)

export const viewOverlay = (state: Model): View => viewBubble(state)

const viewBubble = (state: Model): View => {
  const data = toReady(state)
  return data ? showBubble(data) : hideBubble(state)
}

const hideBubble = (state: Model): View => nothing
const showBubble = ({ query: { rect }, status, result }: Ready): View =>
  html`<button
    class="bubble simlinks ${rect.width < 0 ? 'backward' : 'forward'} ${status}"
    style="top:${rect.top}px;
      left:${rect.width < 0 ? rect.left : rect.left + rect.width}px;
      font-size:${rect.height}px;
      line-height:${rect.height}px;"
  >
    <div class="summary">‡${result.similar.length}</div>
    <!-- details -->
    <div class="details">${viewSimlinks(result.similar)}</div>
  </button>`

const viewSidebar = (state: Model): View =>
  html`<aside class="panel simlinks">
    <h2 class="marked"><span>Simlinks</span></h2>
    ${viewQuery(state.query)} ${viewKeywords(state.result ? state.result.keywords : [])}
    ${viewSimlinks(state.result ? state.result.similar : [])}
  </aside> `

const viewTooltip = (state: Model): View => {
  switch (state.status) {
    case Status.Idle:
    case Status.Pending:
      return viewInactiveTooltip(state)
    case Status.Ready:
      return viewActiveTooltip(state)
  }
}

const viewInactiveTooltip = (state: Idle | Pending) => nothing

const viewActiveTooltip = ({ query: { rect }, result }: Ready) =>
  html`<dialog
    class="tooltip simlinks"
    style="top: ${rect.top + rect.height}px; left:${rect.width < 0
      ? rect.left
      : rect.left + rect.width}px;"
  >
    ${viewSimlinks(result.similar)}
  </dialog>`

const viewQuery = (query: Query | null) =>
  html`<div class="query">
    <span class="name">similar</span><span class="input">${query ? query.input.content : ''}</span>
  </div>`

const viewKeywords = (keywords: string[]) => viewList(keywords || [], viewKeyword, ['keyword'])
const viewKeyword = (name: string) => html`<a href="#${name}" class="keyword">${name}</a>`

const viewSimlinks = (entries: Simlink[]): View =>
  viewList(entries.slice(0, 3), viewSimlink, ['simlink'])
const viewSimlink = (entry: Simlink): View => viewResource(entry.resource)
