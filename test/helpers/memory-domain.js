/**
 * 内存版存储域：与 ctx.storageDomain.open() 返回的 Domain 句柄保持同一组
 * 外部方法（global.get/set，table(...).get/entries/keys/put/delete），
 * 供领域服务测试使用。数据在多个领域服务实例之间共享，用来模拟重启。
 */
export function createMemoryDomain() {
  const tables = new Map()
  let globalValue

  return {
    name: 'chrono_scope',
    global: {
      get: () => clone(globalValue),
      set: async (value) => {
        globalValue = clone(value)
      },
    },
    table(name) {
      if (name !== 'intervals' && name !== 'tasks') throw new Error(`内存域没有表：${name}`)
      if (!tables.has(name)) tables.set(name, new Map())
      const table = tables.get(name)
      return {
        get: (key) => clone(table.get(key)),
        entries: () => [...table.entries()].map(([key, value]) => [key, clone(value)])[Symbol.iterator](),
        keys: () => [...table.keys()][Symbol.iterator](),
        put: async (key, value) => {
          table.set(key, clone(value))
        },
        delete: async (key) => {
          if (!table.has(key)) return false
          table.delete(key)
          return true
        },
      }
    },
    close: async () => {},
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}
