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
    currentUrl: null,
    isManga: false,
    isChapter: false
  },
  getters: {
    isLoading (state) {
      return state.isLoading
    },
    isNavigating (state) {
      return state.isNavigating
    },
    sites (state) {
      return state.sites
    },
    savedTraffic (state) {
      return state.savedTraffic
    },
    savedTrafficMB (state) {
      return Math.floor(state.savedTraffic / 1024 / 1024)
    },
    currentUrl (state) {
      return state.currentUrl
    },
    isManga (state) {
      return state.currentUrl !== null && state.isManga
    },
    isChapter (state) {
      return state.currentUrl !== null && state.isChapter
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
    },
    SITE_NAVIGATED (store) {
      store.isNavigating = false
    },
    INFO_UPDATE (store, newInfo) {
      const { savedTraffic } = newInfo
      if (savedTraffic) {
        store.savedTraffic = savedTraffic
      }
    },
    URL_CURRENT (store, url) {
      store.currentUrl = url
    },
    CONTROLS_UPDATE (store, data) {
      store.isManga = data.isManga
      store.isChapter = data.isChapter
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
    }
  }
})

const messageParser = new MessageParser(store)
messageParser.subscribe()

export default store
