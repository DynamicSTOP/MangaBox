<script>
import { mapState } from 'vuex'
import OpenSite from './TopBar/OpenSite'
export default {
  name: 'TopBar',
  components: { OpenSite },
  computed: {
    ...mapState(['savedTraffic', 'sites', 'isManga', 'isAddingManga', 'isMangaStored']),
    infoTitle () {
      return `loaded ${this.savedTraffic} bytes from cache`
    },
    savedTrafficMB () {
      return Math.floor(this.savedTraffic / 1024 / 1024)
    },
    isDisabled () {
      return !this.isManga || this.isAddingManga
    },
    isActive () {
      return this.isManga && !this.isMangaStored
    }
  },
  methods: {
    add () {
      if (this.isActive) {
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
        :key="'os_'+site.index"
        :text="site.text"
        :pattern="site.pattern"
        :index="site.index"
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
          v-show="isActive"
          :class="{active:isActive, disabled: isDisabled}"
          @click="add"
        >
          Add
        </div>
        <div v-if="isMangaStored">
          stored
        </div>
      </div>
    </div>
  </div>
</template>
