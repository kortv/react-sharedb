global.DEBUG = process.env.DEBUG || process.env.debug
import React from 'react'
import { expect } from 'chai'
import { mount } from 'enzyme'
import { createWaitForElement } from 'enzyme-wait'
import _ from 'lodash'
import './_server'
import waitForExpect from 'wait-for-expect'

// import Simple from './stubs/Simple'

import ReactWrapper from 'enzyme/build/ReactWrapper'
ReactWrapper.prototype.waitFor = function (selector) {
  return createWaitForElement(selector)(this)
}

let subscribe
let serverModel
let w
let Simple
let Complex
let model

async function initSimple (...args) {
  let initialProps = {}
  if (_.isPlainObject(args[0])) {
    initialProps = args[0]
    args = args.slice(1)
  }
  let Subscribed = subscribe(...args)(Simple())
  let w = mount(<Subscribed {...initialProps} />)
  await w.waitFor('.Simple')
  w.getItems = function () {
    return getSimpleItems(this)
  }
  Object.defineProperty(w, 'items', {
    get: function () {
      return this.getItems()
    }
  })
  w.nextRender = function (...args) {
    return nextRender(this, ...args)
  }
  w.renderSetProps = function (count, props) {
    return renderSetProps(this, count, props)
  }
  return w
}

function getSimpleItems (w) {
  let text = w.find('.Simple').text()
  if (!text) return []
  return text.split(',')
}

async function initComplex (...args) {
  let initialProps = {}
  if (_.isPlainObject(args[0])) {
    initialProps = args[0]
    args = args.slice(1)
  }
  let Subscribed = subscribe(...args)(Complex())
  let w = mount(<Subscribed {...initialProps} />)
  await w.waitFor('.Complex')
  w.getItems = function () {
    return getComplexItems(this)
  }
  Object.defineProperty(w, 'items', {
    get: function () {
      return this.getItems()
    }
  })
  w.nextRender = function (...args) {
    return nextRender(this, ...args)
  }
  w.renderSetProps = function (count, props) {
    return renderSetProps(this, count, props)
  }
  return w
}

function getComplexItems (w) {
  let res = []
  for (let i = 0; i < 10; i++) {
    let el = w.find(`.items${i}`)
    if (!el.exists()) break
    let text = el.text()
    let value
    if (!text) {
      value = []
    } else {
      value = text.split(',')
    }
    res.push(value)
  }
  return res
}

function alias (number) {
  const name = n => `test${n}_`
  if (_.isArray(number)) {
    return number.map(n => name(n))
  } else {
    return name(number)
  }
}

async function renderSetProps (w, count, props) {
  if (!_.isNumber(count)) {
    props = count
    count = 1
  }
  if (!props) throw new Error('No props provided. Use .nextRender() instead')
  let currentRender = w.html().match(/RENDER-(\d+)/)[1]
  if (!currentRender) throw new Error("Component didn't render")
  currentRender = ~~currentRender
  // setProps leads to rerender.
  // each setState also leads to rerender.
  // BUT some setState's (which are synchronous, for example
  // the ones triggered by removeItemData()) are happening in
  // the same render loop with the setProps. So both setState's and
  // setProps may lead to just a single rerender.
  // KEEP THIS IN MIND when figuring out how many renders to wait.
  w.setProps(props)
  let selector = `.RENDER-${currentRender + count}`
  typeof DEBUG !== 'undefined' && console.log('wait for:', selector)
  // await w.waitFor(selector)
}

async function nextRender (w, count = 1, fn) {
  if (typeof count === 'function') {
    fn = count
    count = 1
  }
  let currentRender = w.html().match(/RENDER-(\d+)/)[1]
  if (!currentRender) throw new Error("Component didn't render")
  currentRender = ~~currentRender
  // console.log('>> current', currentRender)
  let selector = `.RENDER-${currentRender + count}`
  typeof DEBUG !== 'undefined' && console.log('wait for:', selector)
  if (fn) fn()
  await w.waitFor(selector)
}

// Workaround to init rpc and subscribe only after the server started (which is a global before)
before(() => {
  serverModel = require('./_client/initRpc')
  subscribe = require('../src').subscribe
  model = require('../src').model
  Simple = require('./stubs/Simple')
  Complex = require('./stubs/Complex')
})

// Unmount component after each test
afterEach(() => {
  if (!w) return
  w.unmount()
})

describe('Helpers', () => {
  it('test RPC', async () => {
    await serverModel.setAsync(`users.${alias(1)}.name`, alias(1))
    w = await initSimple(() => ({ items: ['users', alias(1)] }))
    expect(w.items).to.include(alias(1))
    w.unmount()

    await serverModel.setAsync(`users.${alias(1)}.name`, 'Abrakadabra')
    w = await initSimple(() => ({ items: ['users', alias(1)] }))
    expect(w.items).to.include('Abrakadabra')
    w.unmount()

    await serverModel.setAsync(`users.${alias(1)}.name`, alias(1))
    w = await initSimple(() => ({ items: ['users', alias(1)] }))
    expect(w.items).to.include(alias(1))
  })
})

describe('Docs', () => {
  it('doc by id', async () => {
    w = await initSimple(() => ({ items: ['users', alias(3)] }))
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include(alias(3))
  })

  it('dynamic data update', async () => {
    w = await initSimple(() => ({ items: ['users', alias(1)] }))
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include(alias(1))
    let updateAndCheckName = async newName => {
      serverModel.set(`users.${alias(1)}.name`, newName)
      await w.nextRender()
      expect(w.items)
        .to.have.lengthOf(1)
        .and.include(newName)
    }
    for (let i in _.range(50)) {
      await updateAndCheckName(`TestUpdate${i}_`)
    }
    await updateAndCheckName(alias(1))
  })
})

describe('Queries', () => {
  it('all collection', async () => {
    w = await initSimple(() => ({ items: ['users', {}] }))
    expect(w.items)
      .to.have.lengthOf(5)
      .and.include.members(alias([1, 2, 3, 4, 5]))
  })

  it('parametrized 1', async () => {
    w = await initSimple(() => ({ items: ['users', { color: 'blue' }] }))
    expect(w.items)
      .to.have.lengthOf(2)
      .and.include.members(alias([1, 2]))
  })

  it('parametrized 2', async () => {
    w = await initSimple(() => ({ items: ['users', { color: 'red' }] }))
    expect(w.items)
      .to.have.lengthOf(3)
      .and.include.members(alias([3, 4, 5]))
  })

  it('dynamic data update', async () => {
    w = await initSimple(() => ({ items: ['users', { color: 'red' }] }))
    expect(w.items)
      .to.have.lengthOf(3)
      .and.include.members(alias([3, 4, 5]))
    let updateAndCheckItems = async (index, color, indexes, decrease) => {
      serverModel.set(`users.${alias(index)}.color`, color)
      // Wait for 2 renders when the item is going to disappear from
      // the query results.
      // NOTE: 2 renderings are happening because when
      // the data is changed in the item which is already loaded to
      // the client-side model, it is not getting removed from
      // the query result immediately since the doc ids are updated
      // by query only from the server-side.
      // So for some time the document which doesn't match the query
      // anymore, will still be present in the array.
      let renders = decrease ? 2 : 1
      await w.nextRender(renders)
      expect(w.items)
        .to.have.lengthOf(indexes.length)
        .and.include.members(alias(indexes))
    }
    await updateAndCheckItems(3, 'blue', [4, 5])
    await updateAndCheckItems(4, 'blue', [5])
    await updateAndCheckItems(1, 'red', [1, 5])
    await updateAndCheckItems(3, 'red', [1, 3, 5])
    await updateAndCheckItems(5, 'blue', [1, 3])
    await updateAndCheckItems(1, 'blue', [3])
    await updateAndCheckItems(3, 'blue', [])
    await updateAndCheckItems(5, 'red', [5])
    await updateAndCheckItems(3, 'red', [3, 5])
    await updateAndCheckItems(4, 'red', [3, 4, 5])
  })

  it('dynamic update of query param', async () => {
    w = await initSimple({ color: 'red' }, ({ color }) => ({
      items: ['users', { color }]
    }))
    expect(w.items)
      .to.have.lengthOf(3)
      .and.include.members(alias([3, 4, 5]))
    for (let i = 0; i < 20; i++) {
      w.setProps({ color: 'blue' })
      await w.nextRender()
      expect(w.items)
        .to.have.lengthOf(2)
        .and.include.members(alias([1, 2]))
      w.setProps({ color: 'red' })
      await w.nextRender()
      expect(w.items)
        .to.have.lengthOf(3)
        .and.include.members(alias([3, 4, 5]))
    }
  })
})

describe('Complex', () => {
  it('multiple subscriptions. Query and Doc. Removal of keys.', async () => {
    w = await initComplex(
      {
        color0: 'red',
        color1: 'blue'
      },
      ({ color0, color1, hasCar }) => {
        let res = {
          items0: color0 && ['users', { color: color0 }],
          items1: color1 && ['users', { color: color1 }]
        }
        if (hasCar) res.items2 = ['cars', 'test1_']
        return res
      }
    )
    expect(w.items[0])
      .to.have.lengthOf(3)
      .and.include.members(alias([3, 4, 5]))
    expect(w.items[1])
      .to.have.lengthOf(2)
      .and.include.members(alias([1, 2]))
    expect(w.items[2]).to.have.lengthOf(0)
    // 4 renders should happen: for props change and each item's setState

    await w.setProps({
      color0: 'blue',
      color1: 'red',
      hasCar: true
    })

    await waitForExpect(() => {
      expect(w.items[0])
        .to.have.lengthOf(2)
        .and.include.members(alias([1, 2]))
      expect(w.items[1])
        .to.have.lengthOf(3)
        .and.include.members(alias([3, 4, 5]))
      expect(w.items[2])
        .to.have.lengthOf(1)
        .and.include.members(alias([1]))
    })

    // 1 render should happen: for props and removeItemData -- sync
    await w.setProps({ hasCar: false })
    await waitForExpect(() => {
      expect(w.items[0])
        .to.have.lengthOf(2)
        .and.include.members(alias([1, 2]))
      expect(w.items[1])
        .to.have.lengthOf(3)
        .and.include.members(alias([3, 4, 5]))
      expect(w.items[2]).to.have.lengthOf(0)
    })
    await w.setProps({
      color0: undefined,
      color1: { $in: ['red', 'blue'] },
      hasCar: true
    })
    await waitForExpect(() => {
      expect(w.items[0]).to.have.lengthOf(0)
      expect(w.items[1])
        .to.have.lengthOf(5)
        .and.include.members(alias([1, 2, 3, 4, 5]))
      expect(w.items[2])
        .to.have.lengthOf(1)
        .and.include.members(alias([1]))
    })
    await w.setProps({
      color0: 'red',
      hasCar: false
    })
    await waitForExpect(() => {
      expect(w.items[0])
        .to.have.lengthOf(3)
        .and.include.members(alias([3, 4, 5]))
      expect(w.items[1])
        .to.have.lengthOf(5)
        .and.include.members(alias([1, 2, 3, 4, 5]))
      expect(w.items[2]).to.have.lengthOf(0)
    })
  })
})

describe('Local', () => {
  it('should update data', async () => {
    w = await initSimple(() => ({ items: '_page.document' }))
    expect(w.items).to.have.lengthOf(0)
    model.set('_page.document', { id: alias(1), name: alias(1) })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include(alias(1))
    model.set('_page.document', { id: alias(2), name: alias(2) })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include(alias(2))
    model.del('_page.document')
    expect(w.items).to.have.lengthOf(0)
    model.set('_page.document', { id: alias(3), name: alias(3) })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include(alias(3))
    model.del('_page.document')
  })
})

describe('Edge cases', () => {
  it('initially null document. Then update to create it.', async () => {
    let userId = alias(777)
    w = await initSimple(() => ({ items: ['users', userId] }))
    expect(w.items).to.have.lengthOf(0)
    serverModel.add(`users`, {
      id: userId,
      name: userId
    })
    await w.nextRender()
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include(userId)
    serverModel.set(`users.${userId}.name`, 'Abrakadabra')
    await w.nextRender()
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('Abrakadabra')
    serverModel.set(`users.${userId}.name`, 'Blablabla')
    await w.nextRender()
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('Blablabla')
    serverModel.del(`users.${userId}`)
    await w.nextRender()
    expect(w.items).to.have.lengthOf(0)
    serverModel.add(`users`, {
      id: userId,
      name: userId
    })
    await w.nextRender()
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include(userId)
    serverModel.set(`users.${userId}.name`, 'Abrakadabra')
    await w.nextRender()
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('Abrakadabra')
    serverModel.del(`users.${userId}`)
    await w.nextRender()
    w.unmount()
  })

  it('ref NON existent local document and ensure reactivity', async () => {
    w = await initSimple(() => ({ items: '_page.document' }))
    expect(w.items).to.have.lengthOf(0)
    await w.nextRender(() => {
      model.set('_page.document', { id: 'document', name: 'document' })
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('document')
    await w.nextRender(() => model.set('_page.document.name', 'first'))
    // await new Promise(resolve => setTimeout(resolve, 1000))
    // await w.nextRender(3, () => {})
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('first')
    await w.nextRender(() => model.set('_page.document.name', 'second'))
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('second')
    model.del('_page.document')
    // await w.nextRender(3, () => {})
  })

  it('ref an existing local document and ensure reactivity', async () => {
    model.set('_page.document', { id: 'document', name: 'document' })
    w = await initSimple(() => ({ items: '_page.document' }))
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('document')
    await w.nextRender(() => model.set('_page.document.name', 'first'))
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('first')
    await w.nextRender(() => model.set('_page.document.name', 'second'))
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('second')
    model.del('_page.document')
  })

  it('should render only when changing something which was rendered before', async () => {
    model.set('_page.document', { id: 'document', name: 'document' })
    w = await initSimple(() => ({ items: '_page.document' }))
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('document')
    await w.nextRender(() => {
      model.set('_page.document.name', 'first')
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('first')
    await w.nextRender(() => {
      model.set('_page.document.color', 'red')
      model.set('_page.document.name', 'second')
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('second')
    await w.nextRender(() => {
      model.set('_page.document.color', 'green')
      model.set('_page.document.name', 'third')
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('third')
    await w.nextRender(() => {
      model.set('_page.document.showColor', true)
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('third')
    await w.nextRender(() => {
      model.set('_page.document.color', 'yellow')
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('third')
    await w.nextRender(2, () => {
      model.set('_page.document.color', 'orange')
      model.set('_page.document.name', 'fourth')
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('fourth')
    await w.nextRender(() => {
      model.del('_page.document.showColor')
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('fourth')
    await w.nextRender(2, () => {
      model.set('_page.document.color', 'grey')
      model.set('_page.document.name', 'fifth')
      model.set('_page.document.color', 'black')
      model.set('_page.document.name', 'sixth')
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('sixth')
    model.del('_page.document')
  })

  it('model.setEach() should batch changes and only render once', async () => {
    model.set('_page.document', {
      id: 'document',
      name: 'document',
      showColor: true
    })
    w = await initSimple(() => ({ items: '_page.document' }))
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('document')
    await w.nextRender(() => {
      model.set('_page.document.color', 'grey')
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('document')
    await w.nextRender(3, () => {
      model.setEach('_page.document', { color: 'green', name: 'first' })
      model.setEach('_page.document', { color: 'black', name: 'second' })
      model.setEach('_page.document', { color: 'yellow', name: 'third' })
    })
    expect(w.items)
      .to.have.lengthOf(1)
      .and.include('third')
    model.del('_page.document')
  })
})
