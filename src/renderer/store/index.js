import Vue from 'vue'
import Vuex from 'vuex'

import { sendMessageToMain, MessageParser } from './messages'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    isLoading: true,
    isNavigating: false,
    sites: [],
    savedTraffic: 0,
    currentURL: null,
    isManga: false,
    isChapter: false,
    isAddingManga: false,
    isMangaStored: false,
    allManga: []
  },
  getters: {
    isManga (state) {
      return state.currentURL !== null && state.isManga
    },
    isChapter (state) {
      return state.currentURL !== null && state.isChapter
    },
    isSiteViewOpen (state) {
      return state.currentURL !== null
    }
  },
  mutations: {
    SITE_NAVIGATE (store, url) {
      if (store.isNavigating) return
      store.isNavigating = true
      sendMessageToMain('SITE_NAVIGATE', url)
    },
    CONFIG_UPDATE (store, newConfig) {
      store.isLoading = false
      store.sites = newConfig.sites
      store.allManga = newConfig.allManga
    },
    SITE_NAVIGATED (store, url) {
      store.isNavigating = false
      store.currentURL = url
    },
    INFO_UPDATE (store, newInfo) {
      const { savedTraffic } = newInfo
      if (savedTraffic) {
        store.savedTraffic = savedTraffic
      }
    },
    URL_CURRENT (store, url) {
      store.currentURL = url
    },
    CONTROLS_UPDATE (store, data) {
      store.isManga = data.isManga
      store.isMangaStored = data.isMangaStored
      store.isChapter = data.isChapter
    },
    MANGA_ADD (store) {
      if (store.isAddingManga) return
      store.isAddingManga = true
      sendMessageToMain('MANGA_ADD')
    },
    MANGA_ADDED (store, manga) {
      store.isAddingManga = false
      store.isMangaStored = true
    },
    MANGA_UPDATED (store, manga) {
      const index = store.allManga.findIndex((s) => s.id === manga.id)
      if (index === -1) return console.error('manga not in store!')
      store.allManga.splice(index, 1, manga)
    }
  },
  actions: {
    SITE_NAVIGATE (context, url) {
      context.commit('SITE_NAVIGATE', url)
    },
    APP_LOADED () {
      sendMessageToMain('APP_LOADED')
    },
    INFO_UPDATE (context, info) {
      context.commit('INFO_UPDATE', info)
    },
    URL_CURRENT (context, url) {
      context.commit('URL_CURRENT', url)
    },
    CONTROLS_UPDATE (context, data) {
      context.commit('CONTROLS_UPDATE', data)
    },
    MANGA_ADD (context) {
      context.commit('MANGA_ADD')
    },
    MANGA_ADDED (context, manga) {
      context.commit('MANGA_ADDED', manga)
    },
    MANGA_OPEN (context, manga) {
      sendMessageToMain('MANGA_OPEN', manga)
    },
    MANGA_SET_VIEWED (context, manga) {
      sendMessageToMain('MANGA_SET_VIEWED', manga)
    },
    MANGA_UPDATED (context, manga) {
      context.commit('MANGA_UPDATED', manga)
    }
  }
})

const messageParser = new MessageParser(store)
messageParser.subscribe()

export default store
