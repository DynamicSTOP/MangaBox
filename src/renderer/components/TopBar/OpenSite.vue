<script>
import { mapState } from 'vuex'
export default {
  name: 'OpenSite',
  props: {
    index: {
      type: Number,
      required: true
    },
    text: {
      type: String,
      required: true
    },
    pattern: {
      type: String,
      required: true
    }
  },
  computed: {
    ...mapState(['isNavigating', 'currentURL']),
    isActive () {
      return this.currentURL && this.currentURL.match(this.pattern)
    }
  },
  methods: {
    openSite () {
      this.$store.dispatch('SITE_NAVIGATE', this.index)
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
