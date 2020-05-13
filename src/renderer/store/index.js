import Vue from 'vue'
import Vuex from 'vuex'

import { sendMessageToMain, MessageParser } from './messages'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    isLoading: true,
    isNavigating: false,
    sites: []
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
    }
  },
  actions: {
    SITE_NAVIGATE (context, url) {
      context.commit('SITE_NAVIGATE', url)
    },
    APP_LOADED () {
      sendMessageToMain('APP_LOADED')
    }
  }
})

const messageParser = new MessageParser(store)
messageParser.subscribe()

export default store
