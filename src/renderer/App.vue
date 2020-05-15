<script>
import '@/scss/main.scss'
import { mapState } from 'vuex'

export default {
  name: 'App',
  computed: {
    ...mapState(['isLoading'])
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
