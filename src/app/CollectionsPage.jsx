import React, { useState } from 'react';
import { Button, Tabs, Table, message } from 'antd';
import { UndoOutlined, DeleteOutlined } from '@ant-design/icons';
import { useResource } from '../hooks/useResource';
import { mutate } from '../services/api';
import { EmptyState, ErrorState, formatDate } from '../components/Common';
function Collection({ module }) {
  const [page, setPage] = useState(1);
  const source = useResource(module, {
    trash: true,
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
          emptyText: <EmptyState title="回收站为空" />
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
            render: (_, r) => r.name || r.title
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
            render: (_, r) => (
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
            )
          }
        ]}
      />
    </>
  );
}
export default function CollectionsPage() {
  return (
    <>
      <div className="workspace-heading">
        <div className="page-title">
          <span>
            <DeleteOutlined />
          </span>
          <div>
            <h1>Trash</h1>
            <p>恢复文件前需先恢复父文件夹。</p>
          </div>
        </div>
      </div>
      <div className="surface collection-surface">
        <Tabs
          destroyInactiveTabPane
          items={['files', 'notes', 'secrets'].map((module) => ({
            key: module,
            label: module[0].toUpperCase() + module.slice(1),
            children: <Collection module={module} />
          }))}
        />
      </div>
    </>
  );
}
