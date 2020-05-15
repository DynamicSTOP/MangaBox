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
    currentUrl: null
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
    }
  }
})

const messageParser = new MessageParser(store)
messageParser.subscribe()

export default store
