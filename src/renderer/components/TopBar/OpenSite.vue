<script>
import { mapGetters } from 'vuex'
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
    ...mapGetters(['isNavigating'])
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
    :class="{disabled: isNavigating}"
    @click="openSite"
  >
    {{ text }}
  </div>
</template>
