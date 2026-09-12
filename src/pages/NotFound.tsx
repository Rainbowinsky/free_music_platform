import { Link } from 'react-router-dom';
import Empty from '../components/Empty';

export default function NotFound() {
  return (
    <Empty
      icon="🎵"
      title="页面走丢了"
      desc="你访问的页面不存在，回首页继续听歌吧"
      action={
        <Link className="btn btn-primary" to="/">
          回到首页
        </Link>
      }
    />
  );
}
