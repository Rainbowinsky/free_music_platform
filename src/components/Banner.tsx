import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSongs } from '../store/catalog';
import { usePlayer } from '../store/player';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from './Icons';
import Cover from './Cover';

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  gradient: string;
  songIds: string[];
  to: string;
}

const SLIDES: Slide[] = [
  {
    id: 'daily',
    title: '每日推荐',
    subtitle: '根据你的口味生成',
    desc: '20 首华语热歌，每天 6:00 更新',
    gradient: 'linear-gradient(120deg, #2bb673 0%, #7fe0a8 100%)',
    songIds: ['1357375695', '1330348068', '28815250'],
    to: '/playlist/hot',
  },
  {
    id: 'new',
    title: '新歌速递',
    subtitle: '本周 20 首上新',
    desc: '第一时间听见华语乐坛的新声音',
    gradient: 'linear-gradient(120deg, #3f7fd6 0%, #7db6f2 100%)',
    songIds: ['233931', '1293886117', '449818741'],
    to: '/playlist/new',
  },
  {
    id: 'live',
    title: '摇滚热血现场',
    subtitle: '把音量开到最大',
    desc: '跟着鼓点，把这一整天都甩在身后',
    gradient: 'linear-gradient(120deg, #d9694f 0%, #f0a97c 100%)',
    songIds: ['386175', '385781', '25706282'],
    to: '/playlist/rock',
  },
];

export default function Banner() {
  const [index, setIndex] = useState(0);
  const playQueue = usePlayer((s) => s.playQueue);
  const songs = useSongs();

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const slide = SLIDES[index];
  const artworks = slide.songIds
    .map((id) => songs.find((song) => song.id === id))
    .filter((song): song is NonNullable<typeof song> => Boolean(song));

  return (
    <section className="banner" style={{ background: slide.gradient }}>
      <div className="banner-text">
        <span className="banner-badge">{slide.subtitle}</span>
        <h2 className="banner-title">{slide.title}</h2>
        <p className="banner-desc">{slide.desc}</p>
        <div className="banner-actions">
          <button
            type="button"
            className="btn btn-light"
            onClick={() => playQueue(artworks, 0)}
          >
            <PlayIcon size={15} />
            立即播放
          </button>
          <Link className="btn btn-ghost" to={slide.to}>
            查看歌单
          </Link>
        </div>
      </div>

      <div className="banner-art">
        {artworks.map((song, i) => (
          <Cover
            key={song.id}
            src={song.cover}
            name={song.name}
            size={i === 1 ? 158 : 126}
            radius={12}
            className={`banner-art-item banner-art-${i}`}
          />
        ))}
      </div>

      <button
        type="button"
        className="banner-arrow banner-prev"
        aria-label="上一张"
        onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
      >
        <ChevronLeftIcon size={20} />
      </button>
      <button
        type="button"
        className="banner-arrow banner-next"
        aria-label="下一张"
        onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
      >
        <ChevronRightIcon size={20} />
      </button>

      <div className="banner-dots">
        {SLIDES.map((item, i) => (
          <button
            key={item.id}
            type="button"
            aria-label={`第 ${i + 1} 张`}
            className={`banner-dot ${i === index ? 'is-active' : ''}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </section>
  );
}
