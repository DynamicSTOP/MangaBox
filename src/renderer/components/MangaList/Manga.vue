<script>
export default {
  name: 'Manga',
  props: {
    manga: {
      type: Object,
      required: true
    }
  },
  computed: {
    isOld () {
      return !this.manga.json.newChapters || this.manga.json.newChapters.length === 0
    }
  }
}
</script>
<template>
  <div class="manga">
    <img
      v-if="manga.json.image"
      class="title"
      :src="manga.json.image"
      :class="{old: isOld}"
    >
  </div>
</template>
