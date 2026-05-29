
/* ============================================================
   app.js.html — SPA ルーティング & ロジック
   タレント・インフルエンサー管理 CRM
   ============================================================ */

(function() {
  'use strict';

  // ─── 状態 ──────────────────────────────────────────────
  var state = {
    user: null,
    currentPersonId: null,
    searchPage: 1,
    searchPageSize: 50,
    currentDealId: null,
    nextActionFilter: '',
    checkedPeople: {},
    showCheckedOnly: false
  };

  // ─── 初期化 ────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', function() {
    // ユーザー情報取得
    callServer('getCurrentUser', [], function(res) {
      if (res.success) {
        state.user = res.data;
        var avatar = document.getElementById('user-avatar');
        var uname  = document.getElementById('user-name');
        if (avatar) avatar.textContent = (res.data.displayName || '?')[0].toUpperCase();
        if (uname)  uname.textContent = res.data.displayName + ' (' + res.data.role + ')';
      }
    });

    // ルーター起動
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  });

  // ─── ルーター ──────────────────────────────────────────
  function handleRoute() {
    var hash = location.hash.replace('#', '') || '/';
    var parts = hash.split('?');
    var path = parts[0];
    var params = parseQuery(parts[1] || '');

    // ナビのアクティブ状態を更新
    var navLinks = document.querySelectorAll('.nav-link');
    for (var i = 0; i < navLinks.length; i++) {
      var route = navLinks[i].getAttribute('data-route');
      navLinks[i].classList.toggle('active', path === route || (route === '/deals' && path === '/deal'));
    }

    var app = document.getElementById('app');

    switch (path) {
      case '/':
        renderTemplate('tpl-search-view', app);
        initSearchView();
        break;
      case '/person':
        // 人物詳細は検索画面の右ペインで表示するのが基本だが、
        // 直リンク対応としてここでも処理
        renderTemplate('tpl-search-view', app);
        initSearchView();
        if (params.person_id) {
          setTimeout(function() { openPersonDetail(params.person_id); }, 100);
        }
        break;
      case '/deals':
        renderTemplate('tpl-deal-list', app);
        initDealList();
        break;
      case '/deal':
        if (params.deal_id) {
          renderTemplate('tpl-deal-detail', app);
          initDealDetail(params.deal_id);
        } else {
          location.hash = '#/deals';
        }
        break;
      case '/admin':
        renderTemplate('tpl-admin-view', app);
        initAdminView();
        break;
      default:
        location.hash = '#/';
    }
  }

  // ─── テンプレート描画 ──────────────────────────────────
  function renderTemplate(templateId, container) {
    var tpl = document.getElementById(templateId);
    if (!tpl) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">テンプレートが見つかりません: ' + templateId + '</div></div>';
      return;
    }
    container.innerHTML = '';
    var clone = document.importNode(tpl.content, true);
    container.appendChild(clone);
  }

  // ─── API ラッパー ──────────────────────────────────────
  function callServer(fnName, args, successCb, errorCb) {
    var payload = { args: args };
    
    // CSRFトークン取得
    function getCookie(name) {
        var cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
    var csrftoken = getCookie('csrftoken');

    fetch('/api/' + fnName, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || ''
      },
      body: JSON.stringify(payload)
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(result) {
      if (successCb) successCb(result);
    })
    .catch(function(e) {
      console.error('Server error:', e);
      showToast(e.message || 'サーバーエラーが発生しました', 'error');
      if (errorCb) errorCb(e);
    });
  }

  // ─── トースト ──────────────────────────────────────────
  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    var icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    toast.innerHTML =
      '<span class="toast-icon">' + (icons[type] || 'ℹ') + '</span>' +
      '<span>' + escapeHtml(message) + '</span>' +
      '<button class="toast-close" onclick="this.parentElement.remove()">&times;</button>';

    container.appendChild(toast);

    setTimeout(function() {
      toast.style.animation = 'toast-out .3s ease forwards';
      setTimeout(function() { if (toast.parentElement) toast.remove(); }, 300);
    }, 3000);
  }

  // ─── ユーティリティ ────────────────────────────────────
  function parseQuery(qs) {
    var params = {};
    if (!qs) return params;
    var pairs = qs.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split('=');
      params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    }
    return params;
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showLoading(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }
  function hideLoading(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function getStatusBadgeClass(status) {
    switch (status) {
      case '契約済': return 'badge-success';
      case '交渉中': return 'badge-warning';
      case 'NG':     return 'badge-danger';
      case 'アプローチ中': return 'badge-info';
      default: return 'badge-primary';
    }
  }

  function getPriorityBadgeClass(priority) {
    switch (priority) {
      case '高': return 'badge-danger';
      case '中': return 'badge-warning';
      case '低': return 'badge-info';
      default: return 'badge-primary';
    }
  }

  // ═══════════════════════════════════════════════════════
  //  検索ビュー
  // ═══════════════════════════════════════════════════════
  function initSearchView() {
    var btnCreatePerson = document.getElementById('btn-create-person');
    if (btnCreatePerson) btnCreatePerson.addEventListener('click', openAddPersonModal);
    
    // 一括AI補完ボタンの初期化
    initBatchEnrich();

    var form = document.getElementById('search-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      state.searchPage = 1;
      state.nextActionFilter = '';
      // クイックフィルタボタンのactive解除
      var qfBtns = document.querySelectorAll('.quick-filter-btn');
      for (var q = 0; q < qfBtns.length; q++) qfBtns[q].classList.remove('active');
      doSearch();
    });

    // クイックフィルタボタン
    var quickBtns = document.querySelectorAll('.quick-filter-btn');
    for (var i = 0; i < quickBtns.length; i++) {
      quickBtns[i].addEventListener('click', function() {
        var filter = this.getAttribute('data-filter');
        // トグル: 同じボタン再押下で解除
        if (state.nextActionFilter === filter) {
          state.nextActionFilter = '';
          this.classList.remove('active');
        } else {
          state.nextActionFilter = filter;
          // 全ボタンのactive解除→このボタンだけactive
          var allBtns = document.querySelectorAll('.quick-filter-btn');
          for (var j = 0; j < allBtns.length; j++) allBtns[j].classList.remove('active');
          this.classList.add('active');
        }
        state.searchPage = 1;
        doSearch();
      });
    }

    // フォロワー数レンジスライダー
    initFollowerSlider();

    // 選択のみ表示トグル
    var btnToggleChecked = document.getElementById('btn-toggle-checked');
    if (btnToggleChecked) {
      btnToggleChecked.addEventListener('click', function() {
        state.showCheckedOnly = !state.showCheckedOnly;
        if (state.showCheckedOnly) {
          this.classList.add('active');
          this.style.backgroundColor = '#eef2ff';
        } else {
          this.classList.remove('active');
          this.style.backgroundColor = '';
        }
        applyCheckedFilter();
      });
    }

    // CSV出力
    var btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', exportCheckedToCsv);
    }

    // 全選択チェックボックス
    var checkAll = document.getElementById('search-check-all');
    if (checkAll) {
      checkAll.addEventListener('change', function(e) {
        var isChecked = e.target.checked;
        var checkboxes = document.querySelectorAll('.row-checkbox');
        for (var i = 0; i < checkboxes.length; i++) {
          checkboxes[i].checked = isChecked;
          var pid = checkboxes[i].value;
          if (isChecked) {
             // We need the full row data, but from where?
             // It's attached as property to the row element or fetched from current page data.
             // Best is to store current page data in a variable `currentPageData` or attach it to the tr.
             var tr = checkboxes[i].closest('tr');
             state.checkedPeople[pid] = tr.rowData;
          } else {
             delete state.checkedPeople[pid];
          }
        }
      });
    }

    // 初期検索
    doSearch();
  }

  function applyCheckedFilter() {
    var rows = document.querySelectorAll('#search-results-body tr');
    for (var i = 0; i < rows.length; i++) {
      var pid = rows[i].getAttribute('data-person-id');
      if (state.showCheckedOnly) {
        rows[i].style.display = state.checkedPeople[pid] ? '' : 'none';
      } else {
        rows[i].style.display = '';
      }
    }
  }

  function exportCheckedToCsv() {
    var pids = Object.keys(state.checkedPeople);
    if (pids.length === 0) {
      showToast('出力するデータが選択されていません', 'warning');
      return;
    }
    
    // ヘッダー生成
    var headers = ['person_id', '区分', '名前', 'ユーザー名', 'フォロワー数', 'ステータス', '優先度', '担当（社内）', '次アクション日'];
    var csvContent = "\uFEFF"; // BOM
    csvContent += headers.join(',') + '\n';
    
    pids.forEach(function(pid) {
      var r = state.checkedPeople[pid];
      if (!r) return;
      var row = [
        r.person_id || '',
        r['区分'] || '',
        r['名前'] || '',
        r['ユーザー名'] || '',
        r['フォロワー数'] || '',
        r['ステータス'] || '',
        r['優先度'] || '',
        r['担当（社内）'] || '',
        r['次アクション日'] || ''
      ];
      // escape CSV values
      var escapedRow = row.map(function(val) {
        var str = String(val).replace(/"/g, '""');
        if (str.search(/("|,|\n)/g) >= 0) { str = '"' + str + '"'; }
        return str;
      });
      csvContent += escapedRow.join(',') + '\n';
    });
    
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    var d = new Date();
    var dateStr = d.getFullYear() + ('0'+(d.getMonth()+1)).slice(-2) + ('0'+d.getDate()).slice(-2);
    link.setAttribute('download', 'crm_export_' + dateStr + '.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ─── フォロワー数スライダー ──────────────────────────────
  var FOLLOWER_STEPS = [
    0, 500, 1000, 2000, 3000, 5000, 7000,
    10000, 15000, 20000, 30000, 50000, 70000,
    100000, 150000, 200000, 300000, 500000, 700000, 1000000
  ];

  function sliderToFollowers(val) {
    var idx = Math.round(val / 100 * (FOLLOWER_STEPS.length - 1));
    return FOLLOWER_STEPS[Math.min(idx, FOLLOWER_STEPS.length - 1)];
  }

  function formatFollowers(n) {
    if (n >= 1000000) return (n / 10000).toLocaleString() + '万+';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function initFollowerSlider() {
    var rangeMin = document.getElementById('follower-range-min');
    var rangeMax = document.getElementById('follower-range-max');
    var fill = document.getElementById('follower-slider-fill');
    var display = document.getElementById('follower-range-display');
    var hiddenMin = document.getElementById('search-followers-min');
    var hiddenMax = document.getElementById('search-followers-max');
    if (!rangeMin || !rangeMax) return;

    var searchTimer = null;

    function updateSlider() {
      var minVal = parseInt(rangeMin.value, 10);
      var maxVal = parseInt(rangeMax.value, 10);
      // MIN が MAX を超えないようガード
      if (minVal > maxVal) {
        rangeMin.value = maxVal;
        minVal = maxVal;
      }
      var minFollowers = sliderToFollowers(minVal);
      var maxFollowers = sliderToFollowers(maxVal);
      // hidden input に反映
      hiddenMin.value = minVal === 0 ? '' : String(minFollowers);
      hiddenMax.value = maxVal === 100 ? '' : String(maxFollowers);
      // 表示更新
      var minStr = formatFollowers(minFollowers);
      var maxStr = maxVal === 100 ? '上限なし' : formatFollowers(maxFollowers);
      display.textContent = minStr + ' 〜 ' + maxStr;
      // バー位置更新
      fill.style.left = minVal + '%';
      fill.style.width = (maxVal - minVal) + '%';
    }

    function triggerSearch() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function() {
        state.searchPage = 1;
        doSearch();
      }, 400);
    }

    rangeMin.addEventListener('input', updateSlider);
    rangeMax.addEventListener('input', updateSlider);
    rangeMin.addEventListener('change', triggerSearch);
    rangeMax.addEventListener('change', triggerSearch);

    updateSlider();
  }

  function doSearch() {
    showLoading('search-loading');
    document.getElementById('search-empty').classList.add('hidden');

    var params = {
      keyword:          document.getElementById('search-keyword').value,
      category:         document.getElementById('search-category').value,
      status:           document.getElementById('search-status').value,
      priority:         document.getElementById('search-priority').value,
      followersMin:     document.getElementById('search-followers-min').value,
      followersMax:     document.getElementById('search-followers-max').value,
      nextActionFilter: state.nextActionFilter,
      page:             state.searchPage,
      pageSize:         state.searchPageSize
    };

    callServer('searchPeople', [params], function(res) {
      hideLoading('search-loading');
      if (!res.success) { showToast(res.message, 'error'); return; }

      var data = res.data;
      var tbody = document.getElementById('search-results-body');
      tbody.innerHTML = '';

      if (data.results.length === 0) {
        document.getElementById('search-empty').classList.remove('hidden');
        document.getElementById('search-result-count').textContent = '0件';
        document.getElementById('search-pagination').style.display = 'none';
        return;
      }

      document.getElementById('search-result-count').textContent = data.total + '件中 ' + data.results.length + '件表示';

      for (var i = 0; i < data.results.length; i++) {
        var r = data.results[i];
        var tr = document.createElement('tr');
        tr.setAttribute('data-person-id', r.person_id);
        tr.rowData = r; // store full data for export
        if (r.person_id === state.currentPersonId) tr.classList.add('selected');
        
        var isChecked = !!state.checkedPeople[r.person_id];

        tr.innerHTML =
          '<td style="text-align:center;"><input type="checkbox" class="row-checkbox" value="' + escapeHtml(r.person_id) + '" ' + (isChecked ? 'checked' : '') + '></td>' +
          '<td><strong>' + escapeHtml(r['名前']) + '</strong></td>' +
          '<td><span class="badge badge-primary">' + escapeHtml(r['区分']) + '</span></td>' +
          '<td>' + escapeHtml(r['ユーザー名']) + '</td>' +
          '<td class="text-right">' + escapeHtml(String(r['フォロワー数'] || '')) + '</td>' +
          '<td><span class="badge ' + getStatusBadgeClass(r['ステータス']) + '">' + escapeHtml(r['ステータス'] || '—') + '</span></td>' +
          '<td><span class="badge ' + getPriorityBadgeClass(r['優先度']) + '">' + escapeHtml(r['優先度'] || '—') + '</span></td>' +
          '<td>' + escapeHtml(r['担当（社内）']) + '</td>' +
          '<td>' + escapeHtml(r['次アクション日']) + '</td>';

        // Checkbox click listener
        var chk = tr.querySelector('.row-checkbox');
        chk.addEventListener('change', function(e) {
          var pid = e.target.value;
          if (e.target.checked) {
            state.checkedPeople[pid] = r;
          } else {
            delete state.checkedPeople[pid];
          }
        });
        chk.addEventListener('click', function(e) {
          e.stopPropagation(); // prevent opening detail pane
        });

        tr.addEventListener('click', (function(pid) {
          return function() { openPersonDetail(pid); };
        })(r.person_id));

        tbody.appendChild(tr);
      }

      // ページング
      var pagination = document.getElementById('search-pagination');
      if (data.total > data.pageSize) {
        pagination.style.display = 'flex';
        var totalPages = Math.ceil(data.total / data.pageSize);
        document.getElementById('pagination-info').textContent =
          'ページ ' + data.page + ' / ' + totalPages + '（全' + data.total + '件）';

        var prevBtn = document.getElementById('btn-prev-page');
        var nextBtn = document.getElementById('btn-next-page');
        prevBtn.disabled = data.page <= 1;
        nextBtn.disabled = data.page >= totalPages;

        prevBtn.onclick = function() { state.searchPage--; doSearch(); };
        nextBtn.onclick = function() { state.searchPage++; doSearch(); };

        var inputJump = document.getElementById('input-page-jump');
        var btnJump = document.getElementById('btn-jump-page');
        if (inputJump && btnJump) {
          inputJump.value = data.page;
          inputJump.max = totalPages;
          btnJump.onclick = function() {
            var target = parseInt(inputJump.value, 10);
            if (target >= 1 && target <= totalPages) {
              state.searchPage = target;
              doSearch();
            } else {
              showToast('無効なページ番号です', 'warning');
              inputJump.value = data.page; // revert
            }
          };
          inputJump.onkeypress = function(e) {
            if (e.key === 'Enter') btnJump.click();
          };
        }
      } else {
        pagination.style.display = 'none';
      }
    }, function() {
      hideLoading('search-loading');
    });
  }

  // ─── 新規人物登録モーダル ────────────────────────────────
  function openAddPersonModal() {
    var tpl = document.getElementById('tpl-modal-add-person');
    if (!tpl) return;
    var clone = document.importNode(tpl.content, true);
    document.body.appendChild(clone);

    var backdrop = document.getElementById('modal-backdrop-add-person');

    document.getElementById('btn-cancel-add-person').addEventListener('click', function() {
      backdrop.remove();
    });
    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) backdrop.remove();
    });

    // カスタム項目追加機能
    var btnAddCustom = document.getElementById('btn-add-custom-field');
    var customContainer = document.getElementById('custom-fields-container');
    if (btnAddCustom && customContainer) {
      btnAddCustom.addEventListener('click', function() {
        var row = document.createElement('div');
        row.className = 'form-row custom-field-row';
        row.style.marginBottom = '8px';
        row.innerHTML = 
          '<div class="form-group" style="flex:1;margin-bottom:0;"><input type="text" class="form-control custom-field-key" placeholder="項目名"></div>' +
          '<div class="form-group" style="flex:2;margin-bottom:0;"><input type="text" class="form-control custom-field-val" placeholder="内容"></div>' +
          '<div style="display:flex;align-items:center;"><button type="button" class="btn btn-sm btn-danger btn-remove-custom" style="padding:4px 8px;">×</button></div>';
        
        row.querySelector('.btn-remove-custom').addEventListener('click', function() {
          row.remove();
        });
        customContainer.appendChild(row);
      });
    }

    document.getElementById('add-person-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var name = document.getElementById('new-person-name').value.trim();
      var category = document.getElementById('new-person-category').value;
      if (!name || !category) { showToast('区分と名前は必須です', 'warning'); return; }
      
      var btnSubmit = this.querySelector('button[type="submit"]');
      if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = '登録中...'; }

      var payload = {
        '区分': category,
        '名前': name,
        'ユーザー名': document.getElementById('new-person-username').value,
        'フォロワー数': document.getElementById('new-person-followers').value,
        'URL': document.getElementById('new-person-url').value,
        'サブカテゴリ': document.getElementById('new-person-subcategory').value,
        'タグ': document.getElementById('new-person-tags').value,
        'メモ': document.getElementById('new-person-memo').value
      };

      // カスタム項目の収集とマージ
      var customRows = document.querySelectorAll('.custom-field-row');
      for (var i = 0; i < customRows.length; i++) {
        var k = customRows[i].querySelector('.custom-field-key').value.trim();
        var v = customRows[i].querySelector('.custom-field-val').value;
        if (k) {
          payload[k] = v;
        }
      }

      callServer('createPerson', [payload], function(res) {
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = '&#10133; 登録実行'; }
        if (res.success) {
          showToast(res.message, 'success');
          backdrop.remove();
          doSearch();
        } else {
          showToast(res.message, 'error');
        }
      });
    });
  }

  // ─── 人物詳細（右ペイン） ──────────────────────────────
  function openPersonDetail(personId) {
    if (!personId) {
      showToast('person_id が設定されていません。管理画面でインデックスを再構築してください。', 'warning');
      return;
    }
    state.currentPersonId = personId;

    // 選択行のハイライト更新
    var rows = document.querySelectorAll('#search-results-body tr');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('selected', rows[i].getAttribute('data-person-id') === personId);
    }

    var pane = document.getElementById('person-detail-pane');
    if (!pane) return;
    pane.classList.remove('hidden');

    // テンプレートを右ペインに描画
    renderTemplate('tpl-person-detail', pane);

    // 閉じるボタン
    document.getElementById('btn-close-detail').addEventListener('click', function() {
      pane.classList.add('hidden');
      state.currentPersonId = null;
      var rows2 = document.querySelectorAll('#search-results-body tr');
      for (var j = 0; j < rows2.length; j++) rows2[j].classList.remove('selected');
    });

    // AI情報自動補完ボタン
    var btnAiEnrich = document.getElementById('btn-ai-enrich');
    if (btnAiEnrich) {
      btnAiEnrich.addEventListener('click', function() {
        var personName = document.getElementById('detail-person-name').textContent;
        if (!personName || personName === '—') return;
        
        var originalText = btnAiEnrich.innerHTML;
        btnAiEnrich.innerHTML = '<span class="spinner" style="width:12px;height:12px;margin-right:4px;"></span> 検索・抽出中...';
        btnAiEnrich.disabled = true;
        
        callServer('autoEnrichPerson', [{name: personName}], function(res) {
          btnAiEnrich.innerHTML = originalText;
          btnAiEnrich.disabled = false;
          
          if (res.success) {
            var data = res.data;
            var msg = '【AI抽出結果】\n\n';
            for (var k in data) {
              msg += k + ': ' + (data[k] || '（なし）') + '\n';
            }
            msg += '\n※これらの情報を自動で保存しますか？（メモ欄等に追記するか、対応する項目を更新します）';
            
            if (confirm(msg)) {
               var patch = {};
               if (data['ジャンル']) patch['サブカテゴリ'] = data['ジャンル'];
               if (data['事務所']) patch['所属事務所'] = data['事務所'];
               if (data['X']) patch['X (Twitter)'] = data['X'];
               if (data['YouTube']) patch['YouTube'] = data['YouTube'];
               if (data['Instagram']) patch['Instagram'] = data['Instagram'];
               if (data['TikTok']) patch['TikTok'] = data['TikTok'];
               if (data['居住地']) patch['居住地'] = data['居住地'];
               if (data['出身']) patch['出身'] = data['出身'];
               if (data['性別']) patch['性別'] = data['性別'];
               
               var currentMemo = document.getElementById('crm-memo').value || '';
               var aiMemo = "--- AI自動取得情報 ---\n" + JSON.stringify(data, null, 2);
               if (data['画像URL']) {
                 aiMemo += "\n\n画像URL: " + data['画像URL'];
               }
               patch['メモ'] = currentMemo ? currentMemo + '\n' + aiMemo : aiMemo;
               
               callServer('updatePerson', [personId, patch], function(updateRes) {
                 if (updateRes.success) {
                   showToast('AIの情報をスプレッドシートに反映しました', 'success');
                   loadPersonData(personId);
                 } else {
                   showToast('保存に失敗しました: ' + updateRes.message, 'error');
                 }
               });
            }
          } else {
            showToast('AI取得エラー: ' + res.message, 'error');
          }
        });
      });
    }

    // データ取得
    loadPersonData(personId);
    loadPersonTimeline(personId);
    initPersonForms(personId);
  }

  function loadPersonData(personId) {
    callServer('getPerson', [personId], function(res) {
      if (!res.success) { showToast(res.message, 'error'); return; }

      var d = res.data.data;
      document.getElementById('detail-person-name').textContent = d['名前'] || d[Object.keys(d)[0]] || '—';

      // 画像URLがメモにあればアバター表示
      var avatar = document.getElementById('detail-person-avatar');
      var memoText = d['メモ'] || '';
      var imgMatch = memoText.match(/画像URL:\s*(https?:\/\/[^\s]+)/);
      if (imgMatch && imgMatch[1]) {
        avatar.src = imgMatch[1];
        avatar.style.display = 'block';
      } else {
        avatar.style.display = 'none';
      }

      // 基本情報を描画（スプレッドシートの全項目を動的に表示、CRM情報パネルと重複する項目は除外）
      var basicInfo = document.getElementById('detail-basic-info');
      basicInfo.innerHTML = '';
      
      var keys = Object.keys(d);
      var excludeKeys = [
        'person_id', '_row', 'source_sheet', 'source_row', '_search_text',
        'ステータス', '最終接触日', '次アクション日', '次アクション内容',
        '優先度', '社内担当', '担当（社内）', 'メモ'
      ];
      
      var basicKeys = [];
      for (var k = 0; k < keys.length; k++) {
        var currentKey = keys[k];
        // 'col_' で始まる空列名と、除外対象リストのキーを除く
        if (currentKey && currentKey.indexOf('col_') !== 0 && excludeKeys.indexOf(currentKey) === -1) {
          basicKeys.push(currentKey);
        }
      }

      for (var i = 0; i < basicKeys.length; i++) {
        var key = basicKeys[i];
        var val = d[key] || '';
        var item = document.createElement('div');
        item.className = 'detail-item';

        var label = document.createElement('div');
        label.className = 'detail-label';
        label.textContent = key;

        var value = document.createElement('div');
        value.className = 'detail-value';
        if (key === 'URL' && val) {
          var a = document.createElement('a');
          a.href = val; a.target = '_blank'; a.textContent = val;
          value.appendChild(a);
        } else {
          value.textContent = val || '—';
        }

        item.appendChild(label);
        item.appendChild(value);
        basicInfo.appendChild(item);
      }

      // CRMフォームに値をセット
      setSelectValue('crm-status', d['ステータス']);
      setSelectValue('crm-priority', d['優先度']);
      setInputValue('crm-owner', d['社内担当']);
      setInputValue('crm-next-action-date', d['次アクション日']);
      setInputValue('crm-next-action', d['次アクション内容']);
      setInputValue('crm-memo', d['メモ']);
    });
  }

  function loadPersonTimeline(personId) {
    var container = document.getElementById('person-timeline');
    container.innerHTML = '<div class="loading-inline"><div class="spinner"></div><span>読み込み中...</span></div>';

    callServer('getPersonTimeline', [personId], function(res) {
      container.innerHTML = '';
      if (!res.success) { container.innerHTML = '<p class="text-muted">取得エラー</p>'; return; }

      var logs = res.data;
      if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:16px;"><div class="empty-state-text">活動ログがありません</div></div>';
        return;
      }

      var timeline = document.createElement('div');
      timeline.className = 'timeline';
      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        var item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML =
          '<div class="timeline-date">' + escapeHtml(log['日時']) + '　 <span class="text-muted">' + escapeHtml(log['担当']) + '</span></div>' +
          '<div><span class="timeline-type">' + escapeHtml(log['種別']) + '</span>' + escapeHtml(log['内容']) + '</div>' +
          (log['結果'] ? '<div class="timeline-content" style="margin-top:4px;">→ ' + escapeHtml(log['結果']) + '</div>' : '') +
          (log['次アクション日'] ? '<div class="text-sm text-muted mt-8">次回: ' + escapeHtml(log['次アクション日']) + ' ' + escapeHtml(log['次アクション内容'] || '') + '</div>' : '');
        timeline.appendChild(item);
      }
      container.appendChild(timeline);
    });
  }

  function initPersonForms(personId) {
    // CRM情報保存
    var crmForm = document.getElementById('person-crm-form');
    if (crmForm) {
      crmForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var patch = {
          'ステータス':       document.getElementById('crm-status').value,
          '優先度':           document.getElementById('crm-priority').value,
          '社内担当':         document.getElementById('crm-owner').value,
          '次アクション日':   document.getElementById('crm-next-action-date').value,
          '次アクション内容': document.getElementById('crm-next-action').value,
          'メモ':             document.getElementById('crm-memo').value
        };
        callServer('updatePerson', [personId, patch], function(res) {
          if (res.success) {
            showToast('CRM情報を保存しました', 'success');
          } else {
            showToast(res.message, 'error');
          }
        });
      });
    }

    // ログ追加
    var logForm = document.getElementById('add-log-form');
    if (logForm) {
      logForm.addEventListener('submit', function(e) {
        e.preventDefault();

        // JS二重チェック
        var logType = document.getElementById('log-type').value;
        var logContent = document.getElementById('log-content').value;
        if (!logType) { showToast('種別を選択してください', 'warning'); return; }
        if (!logContent.trim()) { showToast('内容を入力してください', 'warning'); return; }

        var payload = {
          person_id:         personId,
          '種別':            logType,
          '内容':            logContent,
          '結果':            document.getElementById('log-result').value,
          '次アクション日':   document.getElementById('log-next-date').value,
          '次アクション内容': document.getElementById('log-next-content').value
        };

        callServer('addActivityLog', [payload], function(res) {
          if (res.success) {
            showToast(res.message, 'success');
            logForm.reset();
            loadPersonTimeline(personId);
            // CRM情報も再読み込み
            loadPersonData(personId);
          } else {
            showToast(res.message, 'error');
          }
        });
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  案件一覧
  // ═══════════════════════════════════════════════════════
  function initDealList() {
    var form = document.getElementById('deal-filter-form');
    var btnCreate = document.getElementById('btn-create-deal');

    if (form) form.addEventListener('submit', function(e) { e.preventDefault(); loadDeals(); });
    if (btnCreate) btnCreate.addEventListener('click', openCreateDealModal);

    loadDeals();
  }

  function loadDeals() {
    showLoading('deal-loading');
    document.getElementById('deal-empty').classList.add('hidden');

    var filters = {
      keyword: document.getElementById('deal-keyword').value,
      status:  document.getElementById('deal-status-filter').value
    };

    callServer('listDeals', [filters], function(res) {
      hideLoading('deal-loading');
      if (!res.success) { showToast(res.message, 'error'); return; }

      var deals = res.data;
      var tbody = document.getElementById('deal-tbody');
      tbody.innerHTML = '';

      if (!deals || deals.length === 0) {
        document.getElementById('deal-empty').classList.remove('hidden');
        return;
      }

      for (var i = 0; i < deals.length; i++) {
        var d = deals[i];
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escapeHtml(String(d.deal_id)) + '</td>' +
          '<td><strong>' + escapeHtml(d['案件名']) + '</strong></td>' +
          '<td>' + escapeHtml(d['クライアント']) + '</td>' +
          '<td><span class="badge badge-info">' + escapeHtml(d['状態']) + '</span></td>' +
          '<td>' + escapeHtml(d['担当']) + '</td>' +
          '<td>' + escapeHtml(d['納期']) + '</td>';

        tr.addEventListener('click', (function(did) {
          return function() { location.hash = '#/deal?deal_id=' + did; };
        })(d.deal_id));

        tbody.appendChild(tr);
      }
    }, function() {
      hideLoading('deal-loading');
    });
  }

  // ─── 案件作成モーダル ──────────────────────────────────
  function openCreateDealModal() {
    var tpl = document.getElementById('tpl-modal-create-deal');
    var clone = document.importNode(tpl.content, true);
    document.body.appendChild(clone);

    var backdrop = document.getElementById('modal-backdrop');

    document.getElementById('btn-cancel-deal').addEventListener('click', function() {
      backdrop.remove();
    });
    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) backdrop.remove();
    });

    document.getElementById('create-deal-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var name = document.getElementById('new-deal-name').value.trim();
      if (!name) { showToast('案件名を入力してください', 'warning'); return; }

      var payload = {
        '案件名':      name,
        'クライアント': document.getElementById('new-deal-client').value,
        '担当':         document.getElementById('new-deal-owner').value,
        '状態':         document.getElementById('new-deal-status').value,
        '納期':         document.getElementById('new-deal-deadline').value
      };

      callServer('createDeal', [payload], function(res) {
        if (res.success) {
          showToast(res.message, 'success');
          backdrop.remove();
          loadDeals();
        } else {
          showToast(res.message, 'error');
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════
  //  案件詳細
  // ═══════════════════════════════════════════════════════
  function initDealDetail(dealId) {
    state.currentDealId = dealId;

    callServer('getDeal', [dealId], function(res) {
      if (!res.success) { showToast(res.message, 'error'); return; }

      var deal = res.data;
      document.getElementById('deal-detail-name').textContent = deal['案件名'];
      document.getElementById('deal-detail-status').textContent = deal['状態'];

      // フォームに値をセット
      setInputValue('deal-ed-name', deal['案件名']);
      setInputValue('deal-ed-client', deal['クライアント']);
      setSelectValue('deal-ed-status', deal['状態']);
      setInputValue('deal-ed-owner', deal['担当']);
      setInputValue('deal-ed-deadline', deal['納期']);

      // キャスティング候補描画
      renderCastings(deal.castings || []);
    });

    // 候補者追加ボタン
    var btnAdd = document.getElementById('btn-add-person-to-deal');
    if (btnAdd) btnAdd.addEventListener('click', function() { openAddCastingModal(dealId); });
  }

  function renderCastings(castings) {
    var tbody = document.getElementById('casting-tbody');
    var empty = document.getElementById('casting-empty');
    tbody.innerHTML = '';

    if (!castings || castings.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    for (var i = 0; i < castings.length; i++) {
      var c = castings[i];
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="text-sm">' + escapeHtml(c.person_id) + '</td>' +
        '<td><strong>' + escapeHtml(c.person_name || '') + '</strong></td>' +
        '<td><span class="badge ' + getStatusBadgeClass(c['候補ステータス']) + '">' + escapeHtml(c['候補ステータス']) + '</span></td>' +
        '<td>' + escapeHtml(c['提示条件']) + '</td>' +
        '<td>' + escapeHtml(c['NG理由']) + '</td>' +
        '<td>' + escapeHtml(c['メモ']) + '</td>' +
        '<td><button class="btn btn-sm btn-secondary btn-edit-casting" data-dcid="' + c.deal_casting_id + '">編集</button></td>';
      tbody.appendChild(tr);
    }

    // 編集ボタンにイベント
    var editBtns = tbody.querySelectorAll('.btn-edit-casting');
    for (var j = 0; j < editBtns.length; j++) {
      editBtns[j].addEventListener('click', (function(casting) {
        return function(e) {
          e.stopPropagation();
          editCastingInline(casting);
        };
      })(castings[j]));
    }
  }

  function editCastingInline(casting) {
    var newStatus = prompt('候補ステータスを入力:\n（候補 / オファー済 / 承諾 / NG）', casting['候補ステータス'] || '');
    if (newStatus === null) return;

    var patch = { '候補ステータス': newStatus };
    if (newStatus === 'NG') {
      var reason = prompt('NG理由:', casting['NG理由'] || '');
      if (reason !== null) patch['NG理由'] = reason;
    }

    callServer('updateDealCasting', [casting.deal_casting_id, patch], function(res) {
      if (res.success) {
        showToast('更新しました', 'success');
        initDealDetail(state.currentDealId);
      } else {
        showToast(res.message, 'error');
      }
    });
  }

  // ─── 候補者追加モーダル（案件内検索）───────────────────
  function openAddCastingModal(dealId) {
    var tpl = document.getElementById('tpl-modal-add-casting');
    var clone = document.importNode(tpl.content, true);
    document.body.appendChild(clone);

    var backdrop = document.getElementById('modal-backdrop-casting');

    document.getElementById('btn-cancel-casting').addEventListener('click', function() { backdrop.remove(); });
    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });

    document.getElementById('casting-search-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var kw = document.getElementById('casting-search-kw').value;
      callServer('searchPeople', [{ keyword: kw, pageSize: 20 }], function(res) {
        var tbody = document.getElementById('casting-search-tbody');
        tbody.innerHTML = '';
        if (!res.success || !res.data.results.length) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted" style="padding:16px;">結果なし</td></tr>';
          return;
        }
        for (var i = 0; i < res.data.results.length; i++) {
          var r = res.data.results[i];
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + escapeHtml(r['名前']) + '</td>' +
            '<td><span class="badge badge-primary">' + escapeHtml(r['区分']) + '</span></td>' +
            '<td>' + escapeHtml(r['ユーザー名']) + '</td>' +
            '<td><button class="btn btn-sm btn-success btn-add-to-deal" data-pid="' + r.person_id + '">追加</button></td>';
          tbody.appendChild(tr);
        }

        // 追加ボタン
        var addBtns = tbody.querySelectorAll('.btn-add-to-deal');
        for (var j = 0; j < addBtns.length; j++) {
          addBtns[j].addEventListener('click', function() {
            var pid = this.getAttribute('data-pid');
            var btn = this;
            btn.disabled = true;
            btn.textContent = '追加中...';
            callServer('addPersonToDeal', [dealId, pid, '候補'], function(res2) {
              if (res2.success) {
                showToast('候補者を追加しました', 'success');
                btn.textContent = '✓ 追加済';
                btn.classList.remove('btn-success');
                btn.classList.add('btn-secondary');
                // 案件詳細を再読み込み
                initDealDetail(dealId);
              } else {
                showToast(res2.message, 'error');
                btn.disabled = false;
                btn.textContent = '追加';
              }
            });
          });
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════
  //  管理画面
  // ═══════════════════════════════════════════════════════
  function initAdminView() {
    // Index再構築
    var btnRebuild = document.getElementById('btn-rebuild-index');
    if (btnRebuild) {
      btnRebuild.addEventListener('click', function() {
        if (!confirm('90_Index を全件再構築します。よろしいですか？')) return;
        btnRebuild.disabled = true;
        btnRebuild.textContent = '実行中...';
        callServer('rebuildIndex', [], function(res) {
          btnRebuild.disabled = false;
          btnRebuild.textContent = '再構築を実行';
          if (res.success) {
            showToast(res.message, 'success');
          } else {
            showToast(res.message, 'error');
          }
        }, function() {
          btnRebuild.disabled = false;
          btnRebuild.textContent = '再構築を実行';
        });
      });
    }

    // データ検証
    var btnValidate = document.getElementById('btn-validate-data');
    if (btnValidate) {
      btnValidate.addEventListener('click', function() {
        btnValidate.disabled = true;
        btnValidate.textContent = '検証中...';
        callServer('validateData', [], function(res) {
          btnValidate.disabled = false;
          btnValidate.textContent = '検証を実行';
          if (!res.success) { showToast(res.message, 'error'); return; }

          var card = document.getElementById('validation-results-card');
          card.classList.remove('hidden');

          var badge = document.getElementById('validation-count-badge');
          var errors = res.data.errors || [];
          badge.textContent = errors.length + '件';
          badge.className = 'badge ' + (errors.length === 0 ? 'badge-success' : 'badge-danger');

          var tbody = document.getElementById('validation-tbody');
          tbody.innerHTML = '';

          if (errors.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:16px;color:var(--success);">✓ 問題は見つかりませんでした</td></tr>';
            showToast('データに問題はありません', 'success');
            return;
          }

          for (var i = 0; i < errors.length; i++) {
            var err = errors[i];
            var tr = document.createElement('tr');
            tr.innerHTML =
              '<td><span class="badge badge-danger">' + escapeHtml(err.type) + '</span></td>' +
              '<td>' + escapeHtml(err.sheet) + '</td>' +
              '<td>' + err.row + '</td>' +
              '<td>' + escapeHtml(err.detail) + '</td>';
            tbody.appendChild(tr);
          }
          showToast(errors.length + '件の問題が見つかりました', 'warning');
        }, function() {
          btnValidate.disabled = false;
          btnValidate.textContent = '検証を実行';
        });
      });
    }

    // セットアップ
    var btnSetup = document.getElementById('btn-setup-sheets');
    if (btnSetup) {
      btnSetup.addEventListener('click', function() {
        if (!confirm('初期セットアップを実行します。よろしいですか？')) return;
        btnSetup.disabled = true;
        btnSetup.textContent = '実行中...';
        callServer('setupSheets', [], function() {
          btnSetup.disabled = false;
          btnSetup.textContent = 'セットアップ実行';
          showToast('セットアップが完了しました', 'success');
        }, function() {
          btnSetup.disabled = false;
          btnSetup.textContent = 'セットアップ実行';
        });
      });
    }

    // Config読み込み
    callServer('getConfig', [], function(res) {
      if (res.success && res.data) {
        setInputValue('cfg-admin', res.data['admin_emails'] || '');
        setInputValue('cfg-editor', res.data['editor_emails'] || '');
        setInputValue('cfg-viewer', res.data['viewer_emails'] || '');
      }
    });

    // Config保存
    var cfgForm = document.getElementById('config-form');
    if (cfgForm) {
      cfgForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var patch = {
          admin_emails:  document.getElementById('cfg-admin').value,
          editor_emails: document.getElementById('cfg-editor').value,
          viewer_emails: document.getElementById('cfg-viewer').value
        };
        callServer('updateConfig', [patch], function(res) {
          if (res.success) {
            showToast('設定を保存しました', 'success');
          } else {
            showToast(res.message, 'error');
          }
        });
      });
    }
  }

  // ─── DOM ヘルパー ──────────────────────────────────────
  function setInputValue(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val || '';
  }
  function setSelectValue(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    for (var i = 0; i < el.options.length; i++) {
      if (el.options[i].value === (val || '')) {
        el.selectedIndex = i;
        return;
      }
    }
    el.selectedIndex = 0;
  }

  // ─── 一括AI補完ロジック ────────────────────────────────
  var batchEnrichState = {
    isRunning: false,
    targetCount: 0,
    processedCount: 0,
    stopRequested: false
  };

  function initBatchEnrich() {
    var btnBatch = document.getElementById('btn-batch-enrich');
    if (!btnBatch) return;
    
    btnBatch.addEventListener('click', function() {
      var modal = document.getElementById('modal-backdrop-batch-enrich');
      if (!modal) return;
      
      document.getElementById('batch-enrich-setup').classList.remove('hidden');
      document.getElementById('batch-enrich-progress').classList.add('hidden');
      document.getElementById('batch-enrich-log').innerHTML = '';
      document.getElementById('batch-enrich-progress-bar').style.width = '0%';
      document.getElementById('btn-close-batch-enrich').classList.add('hidden');
      document.getElementById('btn-stop-batch-enrich').classList.remove('hidden');
      
      modal.classList.add('show');
    });
    
    document.getElementById('btn-cancel-batch-enrich').addEventListener('click', function() {
      document.getElementById('modal-backdrop-batch-enrich').classList.remove('show');
    });
    
    document.getElementById('btn-close-batch-enrich').addEventListener('click', function() {
      document.getElementById('modal-backdrop-batch-enrich').classList.remove('show');
      doSearch(); // 再読み込みして結果を反映
    });
    
    document.getElementById('btn-stop-batch-enrich').addEventListener('click', function() {
      if (batchEnrichState.isRunning) {
        batchEnrichState.stopRequested = true;
        logBatchEnrich('<span style="color:red;">停止リクエストを受け付けました。現在の処理が終わり次第停止します...</span>');
      } else {
        document.getElementById('modal-backdrop-batch-enrich').classList.remove('show');
      }
    });
    
    document.getElementById('btn-start-batch-enrich').addEventListener('click', function() {
      var count = parseInt(document.getElementById('batch-enrich-count').value, 10);
      if (!count || count < 1) {
        alert('正しい件数を入力してください');
        return;
      }
      
      batchEnrichState.targetCount = count;
      batchEnrichState.processedCount = 0;
      batchEnrichState.stopRequested = false;
      batchEnrichState.isRunning = true;
      
      document.getElementById('batch-enrich-setup').classList.add('hidden');
      document.getElementById('batch-enrich-progress').classList.remove('hidden');
      
      logBatchEnrich('処理を開始します... 対象: ' + count + '件');
      updateBatchProgress();
      
      // 非同期ループを開始
      processNextBatchEnrich();
    });
  }
  
  function logBatchEnrich(msg) {
    var logger = document.getElementById('batch-enrich-log');
    if (!logger) return;
    var d = new Date();
    var time = ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2) + ':' + ('0'+d.getSeconds()).slice(-2);
    logger.innerHTML += '<div><span style="color:#aaa;">['+time+']</span> ' + msg + '</div>';
    logger.scrollTop = logger.scrollHeight;
  }
  
  function updateBatchProgress() {
    var pct = Math.min(100, Math.floor((batchEnrichState.processedCount / batchEnrichState.targetCount) * 100));
    document.getElementById('batch-enrich-progress-bar').style.width = pct + '%';
    document.getElementById('batch-enrich-status-text').innerText = '処理中... ' + batchEnrichState.processedCount + ' / ' + batchEnrichState.targetCount + '件完了';
  }
  
  function finishBatchEnrich(msg) {
    batchEnrichState.isRunning = false;
    logBatchEnrich('<b>' + msg + '</b>');
    document.getElementById('btn-stop-batch-enrich').classList.add('hidden');
    document.getElementById('btn-close-batch-enrich').classList.remove('hidden');
  }
  
  function processNextBatchEnrich() {
    if (batchEnrichState.stopRequested) {
      finishBatchEnrich('ユーザーによって処理が中止されました。');
      return;
    }
    if (batchEnrichState.processedCount >= batchEnrichState.targetCount) {
      finishBatchEnrich('指定された件数（' + batchEnrichState.targetCount + '件）の処理が完了しました！');
      return;
    }
    
    var rows = document.querySelectorAll('#search-results-body tr:not(.ai-processed)');
    if (rows.length === 0) {
      logBatchEnrich('このページの対象がなくなりました。次のページに移動します...');
      var btnNext = document.getElementById('btn-next-page');
      if (btnNext && !btnNext.disabled && btnNext.parentElement.parentElement.style.display !== 'none') {
        btnNext.click();
        setTimeout(processNextBatchEnrich, 3000);
      } else {
        finishBatchEnrich('最後のページに到達したため、処理を終了します。');
      }
      return;
    }
    
    var targetRow = rows[0];
    var personId = targetRow.getAttribute('data-person-id');
    var personName = targetRow.cells[0].innerText;
    
    targetRow.classList.add('ai-processed');
    
    logBatchEnrich('対象: <b>' + personName + '</b> の情報を検索中...');
    
    callServer('autoEnrichPerson', [{name: personName}], function(res) {
      if (!res.success) {
        logBatchEnrich('<span style="color:red;">エラー: ' + res.message + '</span>');
        goToNextWithDelay();
        return;
      }
      
      var data = res.data;
      var patch = {};
      if (data['ジャンル']) patch['サブカテゴリ'] = data['ジャンル'];
      if (data['事務所']) patch['所属事務所'] = data['事務所'];
      if (data['X']) patch['X (Twitter)'] = data['X'];
      if (data['YouTube']) patch['YouTube'] = data['YouTube'];
      if (data['Instagram']) patch['Instagram'] = data['Instagram'];
      if (data['TikTok']) patch['TikTok'] = data['TikTok'];
      if (data['居住地']) patch['居住地'] = data['居住地'];
      if (data['出身']) patch['出身'] = data['出身'];
      if (data['性別']) patch['性別'] = data['性別'];
      
      var currentMemo = targetRow.rowData && targetRow.rowData['メモ'] ? targetRow.rowData['メモ'] : '';
      if (data['画像URL']) {
        patch['メモ'] = currentMemo ? currentMemo + '\n\n画像URL: ' + data['画像URL'] : '画像URL: ' + data['画像URL'];
      }
      
      logBatchEnrich('<span style="color:green;">抽出成功。スプレッドシートへ保存中...</span>');
      
      callServer('updatePerson', [personId, patch], function(updateRes) {
        if (updateRes.success) {
          logBatchEnrich('<span style="color:blue;">保存完了！</span>');
        } else {
          logBatchEnrich('<span style="color:red;">保存エラー: ' + updateRes.message + '</span>');
        }
        batchEnrichState.processedCount++;
        updateBatchProgress();
        goToNextWithDelay();
      });
      
    }, function(err) {
      logBatchEnrich('<span style="color:red;">ネットワークエラー等で失敗しました</span>');
      goToNextWithDelay();
    });
  }
  
  function goToNextWithDelay() {
    logBatchEnrich('API制限を避けるため約5秒待機します...');
    setTimeout(processNextBatchEnrich, 5000);
  }

})();
