<script>
import { mapState } from 'vuex'
export default {
  name: 'OpenSite',
  props: {
    text: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    }
  },
  computed: {
    ...mapState(['isNavigating', 'currentURL']),
    isActive () {
      return this.currentURL && this.currentURL.indexOf(this.url) === 0
    }
  },
  methods: {
    openSite () {
      this.$store.dispatch('SITE_NAVIGATE', this.url)
    }
  }
}
</script>

<template>
  <div
    class="openSite"
    :class="{disabled: isNavigating, active: isActive}"
    @click="openSite"
  >
    {{ text }}
  </div>
</template>
