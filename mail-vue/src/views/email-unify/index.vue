<template>
  <div class="unify-box">
    <div class="header-actions">
      <div class="search">
        <el-input v-model="search" class="search-input" :placeholder="$t('searchByRealName')"/>
      </div>
      <el-select v-model="filter" class="status-select" style="width: 110px">
        <el-option key="all" :label="$t('all')" value="all"/>
        <el-option key="unified" :label="$t('unified')" value="unified"/>
        <el-option key="notUnified" :label="$t('notUnified')" value="notUnified"/>
        <el-option key="matched" :label="$t('matched')" value="matched"/>
        <el-option key="unmatched" :label="$t('unmatched')" value="unmatched"/>
      </el-select>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh"/>
    </div>
    <el-scrollbar class="scrollbar">
      <div>
        <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'"
             :style="first ? 'background: transparent' : ''">
          <loading/>
        </div>
        <el-table :data="filteredList" :empty-text="first ? '' : null" style="width: 100%">
          <el-table-column show-overflow-tooltip :label="$t('realName')" min-width="100" prop="fullName"/>
          <el-table-column show-overflow-tooltip :label="$t('giteaUsername')" min-width="120" prop="giteaUsername"/>
          <el-table-column show-overflow-tooltip :label="$t('giteaEmail')" min-width="180" prop="giteaEmail"/>
          <el-table-column show-overflow-tooltip :label="$t('sub2apiEmail')" min-width="180" prop="sub2apiEmail"/>
          <el-table-column :label="$t('tabStatus')" width="100">
            <template #default="props">
              <el-tag disable-transitions v-if="props.row.unified" type="success">{{ $t('unified') }}</el-tag>
              <el-tag disable-transitions v-else-if="props.row.giteaUsername" type="warning">{{ $t('notUnified') }}</el-tag>
              <el-tag disable-transitions v-else type="info">{{ $t('unmatched') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('tabSetting')" width="130">
            <template #default="props">
              <el-button size="small" type="primary" v-if="props.row.giteaUsername && !props.row.unified"
                         :loading="assignLoading === props.row.giteaUsername" @click="assign(props.row)">
                {{ $t('assignEmail') }}
              </el-button>
              <el-button size="small" type="primary" v-else-if="!props.row.giteaUsername"
                         :loading="assignLoading === props.row.fullName" @click="create(props.row)">
                {{ $t('createGitea') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import {computed, ref} from 'vue'
import {giteaAssign, giteaCreate, giteaMatch} from '@/request/gitea.js'
import {Icon} from "@iconify/vue";
import loading from "@/components/loading/index.vue";
import {useI18n} from 'vue-i18n';

defineOptions({
  name: 'email-unify'
})

const {t} = useI18n();
const search = ref('')
const filter = ref('all')
const first = ref(true)
const tableLoading = ref(false)
const assignLoading = ref('')
const list = ref([])

const filteredList = computed(() => {
  return list.value.filter(row => {
    if (search.value && !row.fullName.includes(search.value) && !row.giteaUsername.includes(search.value)) {
      return false
    }
    if (filter.value === 'unified') return row.unified
    if (filter.value === 'notUnified') return !row.unified && !!row.giteaUsername
    if (filter.value === 'matched') return row.matched
    if (filter.value === 'unmatched') return !row.matched
    return true
  })
})

function refresh() {

  if (tableLoading.value) return

  tableLoading.value = true
  giteaMatch().then(data => {
    list.value = data.list
    first.value = false
    if (data.sub2apiError) {
      ElMessage({
        message: 'Sub2api: ' + data.sub2apiError,
        type: 'warning',
        plain: true,
      })
    }
  }).finally(() => {
    tableLoading.value = false
  })
}

function assign(row) {

  if (assignLoading.value) return

  assignLoading.value = row.giteaUsername
  giteaAssign(row.giteaUsername).then(data => {
    row.giteaEmail = data.email
    row.unified = true
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
  }).finally(() => {
    assignLoading.value = ''
  })
}

function create(row) {

  if (assignLoading.value) return

  assignLoading.value = row.fullName
  giteaCreate(row.fullName).then(data => {
    row.giteaUsername = data.email.split('@')[0]
    row.giteaEmail = data.email
    row.unified = true
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
  }).finally(() => {
    assignLoading.value = ''
  })
}

refresh()

</script>

<style scoped lang="scss">
.unify-box {
  height: 100%;
  display: flex;
  flex-direction: column;

  .header-actions {
    display: flex;
    align-items: center;
    height: 38px;
    box-shadow: var(--header-actions-border);
    padding-left: 10px;
    padding-right: 10px;

    .icon {
      cursor: pointer;
      margin-left: 8px;
    }

    .search {
      margin-left: 10px;
    }
  }

  .scrollbar {
    flex: 1;
    overflow: hidden;

    .loading {
      display: flex;
      justify-content: center;
      align-items: center;
      position: absolute;
      left: 0;
      right: 0;
      top: 38px;
      bottom: 0;
      z-index: 10;

      &.loading-show {
        display: flex;
      }

      &.loading-hide {
        display: none;
      }
    }
  }
}
</style>
