import React, { useState } from 'react';
import { Button, Tabs, Table, message } from 'antd';
import { UndoOutlined, StarOutlined, DeleteOutlined } from '@ant-design/icons';
import { useResource } from '../hooks/useResource';
import { mutate } from '../services/api';
import { EmptyState, ErrorState, formatDate } from '../components/Common';
function Collection({ module, mode, navigate }) {
  const [page, setPage] = useState(1);
  const source = useResource(module, {
    [mode === 'trash' ? 'trash' : 'favorite']: true,
    offset: (page - 1) * 50,
    limit: 50
  });
  return (
    <>
      <ErrorState error={source.error} retry={source.reload} />
      <Table
        rowKey="id"
        loading={source.loading}
        dataSource={source.items}
        size="small"
        locale={{
          emptyText: (
            <EmptyState
              title={mode === 'trash' ? '回收站是空的' : '还没有收藏'}
              description={
                mode === 'trash'
                  ? '删除的记录会出现在这里，可随时恢复。'
                  : '给常用的文件、笔记和密钥加一颗星。'
              }
            />
          )
        }}
        pagination={{
          current: page,
          pageSize: 50,
          total: source.total,
          onChange: setPage,
          showSizeChanger: false
        }}
        columns={[
          {
            title: '名称',
            render: (_, r) => (
              <button
                className="text-button"
                onClick={() => mode !== 'trash' && navigate(module, r.id)}
              >
                {r.name || r.title}
              </button>
            )
          },
          {
            title: '更新时间',
            dataIndex: 'updated_at',
            width: 150,
            render: formatDate,
            responsive: ['md']
          },
          {
            title: '',
            width: 100,
            render: (_, r) =>
              mode === 'trash' ? (
                <Button
                  icon={<UndoOutlined />}
                  onClick={async () => {
                    try {
                      await mutate(`/${module}/${r.id}/restore`);
                      source.reload();
                      window.dispatchEvent(new Event('vault:storage'));
                    } catch (e) {
                      message.error(e.message);
                    }
                  }}
                >
                  恢复
                </Button>
              ) : (
                <Button onClick={() => navigate(module, r.id)}>打开</Button>
              )
          }
        ]}
      />
    </>
  );
}
export default function CollectionsPage({ mode, navigate }) {
  return (
    <>
      <div className="workspace-heading">
        <div className="page-title">
          <span>{mode === 'trash' ? <DeleteOutlined /> : <StarOutlined />}</span>
          <div>
            <h1>{mode === 'trash' ? 'Trash' : 'Favorites'}</h1>
            <p>
              {mode === 'trash'
                ? '暂别的内容，仍有归处。文件夹恢复前请先恢复其父目录。'
                : '把常用的东西，留在手边。'}
            </p>
          </div>
        </div>
      </div>
      <div className="surface collection-surface">
        <Tabs
          destroyInactiveTabPane
          items={['files', 'notes', 'secrets'].map((module) => ({
            key: module,
            label: module[0].toUpperCase() + module.slice(1),
            children: <Collection module={module} mode={mode} navigate={navigate} />
          }))}
        />
      </div>
    </>
  );
}
