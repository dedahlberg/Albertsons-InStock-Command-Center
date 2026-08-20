const BANNERS={
  albertsons:{host:'www.albertsons.com',header:'albertsons'},
  tomthumb:{host:'www.tomthumb.com',header:'tomthumb'},
  randalls:{host:'www.randalls.com',header:'randalls'},
  united:{host:'www.unitedsupermarkets.com',header:'unitedsupermarkets'},
  marketstreet:{host:'www.marketstreetunited.com',header:'marketstreet'}
};

const PUBLIC_WEB_SEARCH_KEY='e914eec9448c4d5eb672debf5011cf8f';
const norm=v=>String(v??'').replace(/\D/g,'');
const truth=v=>String(v??'')==='1';

function normalizeDoc(x,storeId){
  const ci=x?.channelInventory||{};
  return {
    pid:x?.pid??x?.productId??x?.id??null,
    upc:x?.upc??x?.upcId??null,
    name:x?.name??x?.productName??x?.title??null,
    storeId:x?.storeId??x?.storeid??storeId,
    price:x?.price??null,
    basePrice:x?.basePrice??null,
    pricePer:x?.pricePer??null,
    promoEndDate:x?.promoEndDate??null,
    inventoryAvailable:x?.inventoryAvailable??x?.inventory??null,
    available:truth(x?.inventoryAvailable??x?.inventory),
    channelEligibility:x?.channelEligibility??null,
    channelInventory:{
      pickup:ci?.pickup??null,
      delivery:ci?.delivery??null,
      instore:ci?.instore??null,
      shipping:ci?.shipping??null
    },
    pickupAvailable:truth(ci?.pickup),
    deliveryAvailable:truth(ci?.delivery),
    instoreAvailable:truth(ci?.instore),
    aisleLocation:x?.aisleLocation??null,
    departmentName:x?.departmentName??null,
    shelfName:x?.shelfName??null,
    status:x?.status??null,
    imageUrl:x?.imageUrl??null
  };
}

async function exactProduct(cfg,storeId,productId){
  const base=`https://${cfg.host}`;
  const u=new URL(`${base}/abs/pub/xapi/product/v2/pdpdata`);
  const p={bpn:productId,banner:cfg.header,storeId,bannerId:'6',includeProductRating:'true',realTimeReviewRating:'true',guest:'false',includeOffer:'true',pgm:'abs'};
  Object.entries(p).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u,{headers:{'Accept':'application/json','Referer':`${base}/shop/product-details.${productId}.html`,'User-Agent':'Mozilla/5.0 (compatible; Albertsons-InStock-Command-Center/1.0)','x-swy-banner':cfg.header,'x-swy-client-id':'web-portal'}});
  const text=await r.text();
  if(!r.ok)return {ok:false,status:r.status,error:'PDP endpoint returned an error',body:text.slice(0,500)};
  let data; try{data=JSON.parse(text)}catch{return {ok:false,status:502,error:'Non-JSON PDP response',body:text.slice(0,500)}}
  const docs=data?.catalog?.response?.docs||[];
  const results=Array.isArray(docs)?docs.map(x=>normalizeDoc(x,storeId)):[];
  return {ok:true,source:'pdpdata',rawCount:docs.length,results,matched:results.filter(x=>norm(x.pid)===norm(productId))};
}

async function keywordSearch(cfg,storeId,q,rows){
  const base=`https://${cfg.host}`;
  const u=new URL(`${base}/abs/pub/xapi/search/substitute`);
  const p={'request-id':`${Date.now()}-${Math.random().toString(36).slice(2,10)}`,url:base,pageurl:base,pagename:'search',rows:String(rows),start:'0','search-type':'keyword',storeid:storeId,featured:'true','search-uid':'',q,channel:'pickup',banner:cfg.header};
  Object.entries(p).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u,{headers:{'Accept':'application/json','Ocp-Apim-Subscription-Key':process.env.ABS_SEARCH_KEY||PUBLIC_WEB_SEARCH_KEY,'Referer':`${base}/shop/search-results.html`,'User-Agent':'Mozilla/5.0 (compatible; Albertsons-InStock-Command-Center/1.0)','x-swy-banner':cfg.header,'x-swy-client-id':'web-portal'}});
  const text=await r.text();
  if(!r.ok)return {ok:false,status:r.status,error:'Search endpoint returned an error',body:text.slice(0,500)};
  let data; try{data=JSON.parse(text)}catch{return {ok:false,status:502,error:'Non-JSON search response',body:text.slice(0,500)}}
  const docs=data?.response?.docs||data?.docs||data?.products||[];
  const results=Array.isArray(docs)?docs.map(x=>normalizeDoc(x,storeId)):[];
  return {ok:true,source:'search',rawCount:docs.length,results,matched:results};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');
  const banner=String(req.query.banner||'albertsons').toLowerCase();
  const storeId=String(req.query.storeId||req.query.storeid||'').trim();
  const q=String(req.query.q||'').trim();
  const productId=String(req.query.productId||req.query.pid||'').trim();
  const rows=Math.min(Math.max(Number(req.query.rows)||25,1),50);
  const cfg=BANNERS[banner];
  if(!cfg)return res.status(400).json({ok:false,error:'Unsupported banner',supported:Object.keys(BANNERS)});
  if(!storeId||(!productId&&!q))return res.status(400).json({ok:false,error:'storeId and productId or q are required'});
  try{
    const result=productId?await exactProduct(cfg,storeId,productId):await keywordSearch(cfg,storeId,q,rows);
    if(!result.ok)return res.status(result.status||502).json(result);
    return res.status(200).json({ok:true,banner,storeId,requested:{productId:productId||null,q:q||null},source:result.source,count:result.rawCount,results:result.results,matched:result.matched});
  }catch(e){return res.status(502).json({ok:false,error:'Availability request failed',detail:e?.message||String(e)})}
}
