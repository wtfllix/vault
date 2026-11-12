import React, { useState } from 'react';
import { Segmented, Table } from 'antd';
import {
  HistoryOutlined,
  FolderOutlined,
  FileOutlined,
  FileTextOutlined,
  KeyOutlined
} from '@ant-design/icons';
import { useResource } from '../hooks/useResource';
import { EmptyState, ErrorState, formatDate } from '../components/Common';

const icons = { files: <FolderOutlined />, notes: <FileTextOutlined />, secrets: <KeyOutlined /> };
const labels = { files: 'Files', notes: 'Notes', secrets: 'Secrets' };
export default function RecentPage({ navigate }) {
  const [module, setModule] = useState('all');
  const [page, setPage] = useState(1);
  const source = useResource('recent', {
    ...(module === 'all' ? {} : { module }),
    limit: 50,
    offset: (page - 1) * 50
  });
  return (
    <>
      <div className="workspace-heading">
        <div className="page-title">
          <span>
            <HistoryOutlined />
          </span>
          <h1>Recent</h1>
        </div>
      </div>
      <div className="module-toolbar">
        <Segmented
          value={module}
          onChange={(value) => {
            setModule(value);
            setPage(1);
          }}
          options={[
            { value: 'all', label: '全部' },
            ...Object.entries(labels).map(([value, label]) => ({ value, label }))
          ]}
        />
      </div>
      <div className="surface collection-surface">
        <ErrorState error={source.error} retry={source.reload} />
        <Table
          rowKey={(row) => `${row.module}:${row.id}`}
          size="small"
          loading={source.loading}
          dataSource={source.items}
          locale={{ emptyText: <EmptyState title="暂无使用记录" /> }}
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
              render: (_, row) => (
                <button
                  className="text-button recent-name"
                  aria-label={row.title}
                  onClick={() => navigate(row.module, row.id)}
                >
                  <span aria-hidden="true">
                    {row.module === 'files' && row.type !== 'Folder' ? (
                      <FileOutlined />
                    ) : (
                      icons[row.module]
                    )}
                  </span>
                  <span>{row.title}</span>
                </button>
              )
            },
            {
              title: '模块',
              dataIndex: 'module',
              width: 100,
              responsive: ['md'],
              render: (value) => labels[value]
            },
            { title: '最近使用', dataIndex: 'last_opened_at', width: 150, render: formatDate },
            { title: '次数', dataIndex: 'use_count', width: 70, responsive: ['sm'] }
          ]}
        />
      </div>
    </>
  );
}
