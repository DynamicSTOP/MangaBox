<script>
import '@/scss/main.scss'
import { mapGetters } from 'vuex'

export default {
  name: 'App',
  computed: {
    ...mapGetters(['isLoading'])
  },
  created () {
    this.$store.dispatch('APP_LOADED')
  }
}
</script>

<template>
  <div>
    <div v-if="isLoading">
      Loading...
    </div>
    <router-view v-else />
  </div>
</template>
