<script>
import { mapState } from 'vuex'
import OpenSite from './TopBar/OpenSite'
export default {
  name: 'TopBar',
  components: { OpenSite },
  computed: {
    ...mapState(['savedTraffic', 'sites', 'isManga', 'isAddingManga']),
    infoTitle () {
      return `loaded ${this.savedTraffic} bytes from cache`
    },
    savedTrafficMB () {
      return Math.floor(this.savedTraffic / 1024 / 1024)
    },
    isDisabled () {
      return !this.isManga || this.isAddingManga
    }
  },
  methods: {
    add () {
      if (this.isManga) {
        this.$store.dispatch('MANGA_ADD')
      }
    }
  }
}
</script>

<template>
  <div
    id="topbar"
    class="flex-row"
  >
    <div class="openSites flex-row">
      <open-site
        v-for="site in sites"
        :key="'os_'+site.text"
        :text="site.text"
        :url="site.url"
      />
    </div>
    <div class="topbar-right flex-row">
      <div
        id="topbar-info"
        :title="infoTitle"
      >
        {{ savedTrafficMB }} Mb
      </div>
      <div class="controls">
        <div
          :class="{active:isManga, disabled: isDisabled}"
          @click="add"
        >
          Add
        </div>
      </div>
    </div>
  </div>
</template>
