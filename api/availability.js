const BANNERS={
  albertsons:{host:'www.albertsons.com',header:'albertsons'},
  tomthumb:{host:'www.tomthumb.com',header:'tomthumb'},
  randalls:{host:'www.randalls.com',header:'randalls'},
  united:{host:'www.unitedsupermarkets.com',header:'unitedsupermarkets'}
};

const PUBLIC_WEB_SEARCH_KEY='e914eec9448c4d5eb672debf5011cf8f';

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
  const banner=String(req.query.banner||'albertsons').toLowerCase();
  const storeId=String(req.query.storeId||req.query.storeid||'').trim();
  const q=String(req.query.q||'').trim();
  const rows=Math.min(Math.max(Number(req.query.rows)||10,1),25);
  const cfg=BANNERS[banner];
  if(!cfg)return res.status(400).json({ok:false,error:'Unsupported banner',supported:Object.keys(BANNERS)});
  if(!storeId||!q)return res.status(400).json({ok:false,error:'storeId and q are required'});

  const base=`https://${cfg.host}`;
  const u=new URL(`${base}/abs/pub/xapi/search/substitute`);
  const p={
    'request-id':`${Date.now()}-${Math.random().toString(36).slice(2,10)}`,
    url:base,
    pageurl:base,
    pagename:'search',
    rows:String(rows),
    start:'0',
    'search-type':'keyword',
    storeid:storeId,
    featured:'true',
    'search-uid':'',
    q,
    channel:'pickup',
    banner:cfg.header
  };
  Object.entries(p).forEach(([k,v])=>u.searchParams.set(k,v));

  try{
    const r=await fetch(u,{headers:{
      'Accept':'application/json',
      'Ocp-Apim-Subscription-Key':process.env.ABS_SEARCH_KEY||PUBLIC_WEB_SEARCH_KEY,
      'Referer':`${base}/shop/search-results.html`,
      'User-Agent':'Mozilla/5.0 (compatible; Albertsons-InStock-Command-Center/1.0)',
      'x-swy-banner':cfg.header,
      'x-swy-client-id':'web-portal'
    }});
    const text=await r.text();
    if(!r.ok)return res.status(r.status).json({ok:false,status:r.status,error:'Albertsons Companies endpoint returned an error',body:text.slice(0,500)});
    let data;
    try{data=JSON.parse(text)}catch{return res.status(502).json({ok:false,error:'Non-JSON response',body:text.slice(0,500)})}
    const docs=data?.response?.docs||data?.docs||data?.products||[];
    const results=Array.isArray(docs)?docs.map(x=>({
      pid:x.pid??x.productId??x.id??null,
      upc:x.upc??x.upcId??null,
      name:x.name??x.productName??x.title??null,
      storeId:x.storeId??x.storeid??storeId,
      price:x.price??null,
      basePrice:x.basePrice??null,
      pricePer:x.pricePer??null,
      promoEndDate:x.promoEndDate??null,
      inventoryAvailable:x.inventoryAvailable??x.inventory??null,
      available:String(x.inventoryAvailable??x.inventory??'')==='1'
    })):[];
    return res.status(200).json({ok:true,banner,storeId,q,count:results.length,results});
  }catch(e){
    return res.status(502).json({ok:false,error:'Availability request failed',detail:e?.message||String(e)});
  }
}
